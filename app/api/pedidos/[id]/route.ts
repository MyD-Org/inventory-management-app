import { type NextRequest, NextResponse } from "next/server"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { missingMaterials, readOrder } from "@/lib/orders"

// Estado de un pedido puntual (GET /api/pedidos/{id} en el doc del CRM).
//
// El doc marca como pendiente validar que "sólo deben devolverse a quien lo
// hizo". Acá lo resolvemos exigiendo customer_external_id: hay que saber de qué
// cliente es el pedido para poder verlo, así un id adivinado no alcanza para
// leer el pedido de otro.
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } },
) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const id = Number.parseInt(params.id, 10)
    if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "Id inválido" }, { status: 400 })
    }

    const customerExternalId = (new URL(request.url).searchParams.get("customer_external_id") ?? "").trim()
    if (!customerExternalId) {
        return NextResponse.json({ error: "Falta customer_external_id" }, { status: 400 })
    }

    try {
        const order = await readOrder(id)
        // Mismo 404 si no existe o si es de otro cliente: no confirmamos la
        // existencia de pedidos ajenos.
        if (!order || order.customer_external_id !== customerExternalId) {
            return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
        }

        return NextResponse.json({
            order_id: order.id,
            order_number: order.order_number,
            external_id: order.external_id,
            status: order.status,
            customer_status: order.customer_status,
            eta: order.delivery_date_estimate,
            updated_at: order.updated_at,
            missing_materials: await missingMaterials(order.id),
            items: order.items.map((i) => ({
                product: i.product,
                product_external_id: i.product_external_id,
                quantity: i.quantity,
                specs: i.specs,
            })),
        })
    } catch (error) {
        console.error("Error in GET /api/pedidos/[id]:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
