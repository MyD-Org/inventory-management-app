import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import {
    createOrder,
    customerStatus,
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

    const payload: OrderPayload = {
        external_id: String(body?.external_id ?? ""),
        origin: body?.origin,
        customer: {
            external_id: String(body?.customer?.external_id ?? ""),
            name: body?.customer?.name ?? null,
            phone: body?.customer?.phone ?? null,
        },
        items: Array.isArray(body?.items) ? body.items : [],
        delivery_date_estimate: body?.delivery_date_estimate ?? null,
        priority: body?.priority,
        notes: body?.notes ?? null,
        source_conversation: body?.source_conversation ?? null,
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

        const { created, order } = await createOrder(payload)
        if (!order) return NextResponse.json({ error: "Error interno" }, { status: 500 })

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
            customer_status: customerStatus(r.status),
            eta: r.delivery_date_estimate,
            updated_at: r.updated_at,
        }))

        return NextResponse.json({ count: orders.length, orders })
    } catch (error) {
        console.error("Error in GET /api/pedidos:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
