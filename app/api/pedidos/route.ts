import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { normalizePhone } from "@/lib/order-validation"
import {
    ORDER_ORIGINS,
    createOrder,
    customerStatus,
    isOrderOrigin,
    getCustomerStatusMap,
    missingMaterials,
    readOrder,
    validateOrderPayload,
    type OrderPayload,
} from "@/lib/orders"
import { orderNeedsReview } from "@/lib/order-statuses"
import { apiActor, logOrderEvent } from "@/lib/order-events"

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

    // El origen se valida contra la lista y NO se acepta cualquier string: es lo
    // que después dice la historia del pedido ("creado desde WhatsApp"). Se
    // normaliza a minúscula para no rechazar un "WhatsApp" del bot.
    const origenPedido = typeof body?.origin === "string" ? body.origin.trim().toLowerCase() : ""
    if (origenPedido && !isOrderOrigin(origenPedido)) {
        return NextResponse.json(
            { error: `origin inválido: se espera uno de ${ORDER_ORIGINS.join(", ")}` },
            { status: 400 },
        )
    }
    // Sin origen declarado queda "api": entró por acá, no por la app.
    const origen = origenPedido || "api"

    const payload: OrderPayload = {
        external_id: String(body?.external_id ?? ""),
        // Si el que llama no declara origen, el default NO puede ser el de la app:
        // createOrder cae en "manual" y el pedido termina diciendo que se creó
        // desde la web cuando entró por la API. Acá sabemos que es la API.
        origin: origen,
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

        // Solo si se creó de verdad: con external_id repetido devuelve el pedido
        // original y no hubo alta que registrar.
        if (created && order?.id) {
            const actor = await apiActor(request)
            await logOrderEvent(order.id, { kind: "created", newValue: origen, actor })
            if (payload.notes?.trim()) {
                await logOrderEvent(order.id, { kind: "note", body: payload.notes.trim(), actor })
            }
        }
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

// Consulta de estado por cliente. Hace falta SIEMPRE un filtro de identidad —
// phone o customer_external_id—: sin eso, un bug del bot listaría los pedidos de
// todos los clientes. Se puede acotar a un pedido puntual con external_id.
export async function GET(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const customerExternalId = (searchParams.get("customer_external_id") ?? "").trim()
    // El teléfono es el filtro preferido: en WhatsApp sale de end_user.external_id,
    // que lo inyecta ai-api y el modelo NO controla. customer_external_id, en cambio,
    // lo elige el modelo, y un cliente mal identificado ahí le mostraría a alguien los
    // pedidos de otro. Se mantiene por compatibilidad con el CRM, que sí lo tiene.
    const phone = normalizePhone(searchParams.get("phone"))
    if (!customerExternalId && !phone) {
        return NextResponse.json({ error: "Falta phone o customer_external_id" }, { status: 400 })
    }

    const externalId = (searchParams.get("external_id") ?? "").trim()

    try {
        const overrides = await getCustomerStatusMap()
        // Un solo query con los tres filtros opcionales: el de identidad (por teléfono
        // normalizado o por id del CRM) y el de external_id. La comparación por teléfono
        // normaliza también el lado guardado, porque en la base hay números cargados a
        // mano con espacios y guiones.
        const rows = await sql`
            SELECT id, order_number, external_id, status, delivery_date_estimate::text AS delivery_date_estimate,
                   modified_at::text AS modified_at, delivery_date_verified_at::text AS delivery_date_verified_at,
                   updated_at
            FROM orders
            WHERE (
                (${customerExternalId}::text <> '' AND customer_external_id = ${customerExternalId})
                OR (
                    ${phone}::text <> ''
                    AND length(regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g')) >= 8
                    AND right(regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g'), 10) = ${phone}
                )
            )
              AND (${externalId}::text = '' OR external_id = ${externalId})
            ORDER BY created_at DESC LIMIT 50
        `

        // Cargamos los ítems de todos los pedidos encontrados en una sola query.
        const orderIds = (rows as any[]).map((r) => r.id)
        const itemRows = orderIds.length
            ? await sql`
                SELECT id, order_id, line_no, product, product_external_id, specs, quantity
                FROM order_items
                WHERE order_id = ANY(${orderIds})
                ORDER BY order_id ASC, line_no ASC
            `
            : []
        const itemsByOrder = new Map<number, any[]>()
        for (const i of itemRows as any[]) {
            const list = itemsByOrder.get(i.order_id) ?? []
            list.push({
                line_no: i.line_no,
                product: i.product,
                product_external_id: i.product_external_id,
                quantity: Number(i.quantity),
                specs: i.specs,
            })
            itemsByOrder.set(i.order_id, list)
        }

        // Solo lo que el cliente puede ver: nada de materiales ni jerga interna.
        const orders = (rows as any[]).map((r) => ({
            order_id: r.id,
            order_number: r.order_number,
            external_id: r.external_id,
            status: r.status,
            customer_status: customerStatus(r.status, overrides),
            eta: r.delivery_date_estimate,
            updated_at: r.updated_at,
            needs_review: orderNeedsReview({
                modified_at: r.modified_at,
                delivery_date_verified_at: r.delivery_date_verified_at,
            }),
            items: itemsByOrder.get(r.id) ?? [],
        }))

        return NextResponse.json({ count: orders.length, orders })
    } catch (error) {
        console.error("Error in GET /api/pedidos:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
