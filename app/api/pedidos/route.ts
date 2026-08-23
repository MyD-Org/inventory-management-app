import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import {
    createOrder,
    customerStatus,
    getCustomerStatusMap,
    missingMaterials,
    readOrder,
    validateOrderPayload,
    type OrderPayload,
} from "@/lib/orders"

// Pedidos del agente del CRM (§3 de docs/pedidos-avantec.md). Auth
// server-to-server con el mismo Bearer que los endpoints de ai-tools
// (middleware.ts excluye /api).
//
// La lógica vive en lib/orders.ts, compartida con la vista del taller: cargar un
// pedido a mano y recibirlo del bot dan exactamente el mismo resultado.
//
// Ningún campo de plata, a propósito: el doc dice "por este canal no se habla de
// plata" y el payload del bot no trae precios.

export async function POST(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Body inválido: se esperaba JSON" }, { status: 400 })
    }

    // El contrato del doc es anidado (customer.external_id, items[]). Pero las
    // tools del agente arman el body con plantillas que SOLO interpolan valores
    // planos: un {{params.items}} que sea array tira error antes de salir.
    // Por eso aceptamos además una forma plana equivalente. La anidada tiene
    // prioridad; la plana es el fallback.
    const vacioEsNull = (v: unknown) => {
        const s = typeof v === "string" ? v.trim() : v
        return s === "" || s === undefined ? null : (s as any)
    }

    let items: any[] = Array.isArray(body?.items) ? body.items : []
    if (items.length === 0 && typeof body?.items_json === "string" && body.items_json.trim()) {
        try {
            const parsed = JSON.parse(body.items_json)
            if (Array.isArray(parsed)) items = parsed
        } catch {
            return NextResponse.json(
                { error: "items_json no es JSON válido" },
                { status: 400 },
            )
        }
    }

    const payload: OrderPayload = {
        external_id: String(body?.external_id ?? ""),
        origin: body?.origin,
        customer: {
            external_id: String(body?.customer?.external_id ?? body?.customer_external_id ?? ""),
            name: vacioEsNull(body?.customer?.name ?? body?.customer_name),
            phone: vacioEsNull(body?.customer?.phone ?? body?.customer_phone),
        },
        items,
        delivery_date_estimate: vacioEsNull(body?.delivery_date_estimate),
        priority: vacioEsNull(body?.priority) ?? undefined,
        notes: vacioEsNull(body?.notes),
        source_conversation: vacioEsNull(body?.source_conversation),
    }

    try {
        const errors = await validateOrderPayload(payload)
        if (errors.length > 0) {
            // Un solo error de campo faltante va tal cual, para que el mensaje
            // del bot sea directo ("Falta external_id").
            const single = errors.length === 1 ? errors[0] : null
            if (single && (single.startsWith("Falta") || single.startsWith("El pedido no tiene"))) {
                return NextResponse.json({ error: single }, { status: 400 })
            }
            return NextResponse.json({ error: "Pedido inválido", details: errors }, { status: 400 })
        }

        const { created, incomplete, order } = await createOrder(payload)
        if (!order) return NextResponse.json({ error: "Error interno" }, { status: 500 })

        // El pedido existe pero quedó a medio escribir (ver createOrder). 409
        // para que el bot reintente en vez de darlo por bueno vacío.
        if (incomplete) {
            return NextResponse.json(
                {
                    error: "El pedido está en creación o quedó incompleto. Reintentá.",
                    order_id: order.id,
                    order_number: order.order_number,
                },
                { status: 409 },
            )
        }

        // Forma de respuesta según el doc del CRM.
        const response = {
            order_id: order.id,
            order_number: order.order_number,
            status: order.status,
            customer_status: order.customer_status,
            eta: order.delivery_date_estimate,
            missing_materials: await missingMaterials(order.id),
            ...(created ? {} : { idempotent: true }),
        }
        return NextResponse.json(response, { status: created ? 201 : 200 })
    } catch (error) {
        console.error("Error in POST /api/pedidos:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

// Consulta de estado por cliente. customer_external_id es OBLIGATORIO: sin el
// filtro, un bug del bot listaría los pedidos de todos los clientes.
// Se puede acotar a un pedido puntual con external_id.
export async function GET(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const customerExternalId = (searchParams.get("customer_external_id") ?? "").trim()
    if (!customerExternalId) {
        return NextResponse.json({ error: "Falta customer_external_id" }, { status: 400 })
    }

    const externalId = (searchParams.get("external_id") ?? "").trim()

    try {
        const overrides = await getCustomerStatusMap()
        const rows = externalId
            ? await sql`
                SELECT id, order_number, external_id, status, delivery_date_estimate::text AS delivery_date_estimate, updated_at
                FROM orders
                WHERE customer_external_id = ${customerExternalId} AND external_id = ${externalId}
            `
            : await sql`
                SELECT id, order_number, external_id, status, delivery_date_estimate::text AS delivery_date_estimate, updated_at
                FROM orders
                WHERE customer_external_id = ${customerExternalId}
                ORDER BY created_at DESC LIMIT 50
            `

        // Solo lo que el cliente puede ver: nada de materiales ni jerga interna.
        const orders = (rows as any[]).map((r) => ({
            order_id: r.id,
            order_number: r.order_number,
            external_id: r.external_id,
            status: r.status,
            customer_status: customerStatus(r.status, overrides),
            eta: r.delivery_date_estimate,
            updated_at: r.updated_at,
        }))

        return NextResponse.json({ count: orders.length, orders })
    } catch (error) {
        console.error("Error in GET /api/pedidos:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
