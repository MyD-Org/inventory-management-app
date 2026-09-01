import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { addOrderItemInternal, markDocumentsStale, missingMaterials, readOrder } from "@/lib/orders"
import { isApiEditable } from "@/lib/order-statuses"
import { apiActor, logOrderEvent } from "@/lib/order-events"

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

    try {
        const order = await readOrder(id)
        if (!order) {
            return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
        }
        if (!isApiEditable(order.status)) {
            return NextResponse.json(
                { error: "El pedido no admite modificaciones en este estado" },
                { status: 409 },
            )
        }

        let specs = body?.specs ?? {}
        if (typeof body?.specs_json === "string" && body.specs_json.trim()) {
            try {
                const parsed = JSON.parse(body.specs_json)
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) specs = parsed
            } catch {
                return NextResponse.json({ error: "specs_json no es JSON válido" }, { status: 400 })
            }
        }

        const result = await addOrderItemInternal(id, {
            product: body.product,
            quantity: Number(body.quantity ?? 1),
            specs,
        })

        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }

        await sql`
            UPDATE orders
            SET modified_at = NOW(), delivery_date_verified_at = NULL
            WHERE id = ${id}
        `
        await markDocumentsStale(id)

        await logOrderEvent(id, {
            kind: "item_added",
            newValue: `${Number(body.quantity ?? 1)} × ${body.product}`,
            actor: await apiActor(request),
        })

        return NextResponse.json({
            ok: true,
            order_id: id,
            order_number: order.order_number,
            item_id: result.itemId,
            product: body.product,
            quantity: body.quantity,
            needs_review: result.needs_review,
            unmapped_specs: result.unmapped,
            sin_alegra: result.sin_alegra,
            missing_materials: await missingMaterials(id),
        }, { status: 201 })
    } catch (error) {
        console.error("Error in POST /api/pedidos/[id]/items:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
