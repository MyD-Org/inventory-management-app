import { type NextRequest, NextResponse } from "next/server"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { addOrderItemInternal, missingMaterials, readOrder } from "@/lib/orders"

// Agrega una línea a un pedido existente. Usa la misma lógica interna que la
// vista manual (lib/order-actions.ts) para que el resultado sea idéntico.
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } },
) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const id = Number.parseInt(params.id, 10)
    if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "Id inválido" }, { status: 400 })
    }

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Body inválido: se esperaba JSON" }, { status: 400 })
    }

    const order = await readOrder(id)
    if (!order) {
        return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const payload = {
        product: String(body?.product ?? ""),
        product_external_id: body?.product_external_id ?? null,
        quantity: Number(body?.quantity ?? 1),
        specs: body?.specs ?? {},
    }

    try {
        const result = await addOrderItemInternal(id, payload)
        if ("error" in result) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }

        return NextResponse.json(
            {
                ok: true,
                order_id: id,
                order_number: order.order_number,
                line_id: result.line_id,
                needs_review: result.needs_review,
                sin_alegra: result.sin_alegra,
                unmapped: result.unmapped,
                missing_materials: await missingMaterials(id),
            },
            { status: 201 },
        )
    } catch (error) {
        console.error("Error in POST /api/pedidos/[id]/items:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
