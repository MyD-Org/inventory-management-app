import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { deleteOrderItemInternal, isApiEditable, readOrder, updateOrderItemInternal } from "@/lib/orders"

async function checkOrder(id: number) {
    const order = await readOrder(id)
    if (!order) return { error: "Pedido no encontrado", status: 404 }
    if (!isApiEditable(order.status)) {
        return { error: "El pedido no admite modificaciones en este estado", status: 409 }
    }
    return { order }
}

async function markModified(orderId: number) {
    await sql`
        UPDATE orders
        SET modified_at = NOW(), delivery_date_verified_at = NULL
        WHERE id = ${orderId}
    `
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string; itemId: string } },
) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const orderId = Number.parseInt(params.id, 10)
    const itemId = Number.parseInt(params.itemId, 10)
    if (!Number.isFinite(orderId) || !Number.isFinite(itemId)) {
        return NextResponse.json({ error: "Ids inválidos" }, { status: 400 })
    }

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }

    const check = await checkOrder(orderId)
    if ("error" in check) {
        return NextResponse.json({ error: check.error }, { status: check.status })
    }

    try {
        const result = await updateOrderItemInternal(itemId, {
            quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
            specs: body.specs,
        })
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }
        await markModified(orderId)
        return NextResponse.json({ ok: true, itemId: result.itemId, warning: result.warning })
    } catch (error) {
        console.error("Error in PATCH /api/pedidos/[id]/items/[itemId]:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string; itemId: string } },
) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const orderId = Number.parseInt(params.id, 10)
    const itemId = Number.parseInt(params.itemId, 10)
    if (!Number.isFinite(orderId) || !Number.isFinite(itemId)) {
        return NextResponse.json({ error: "Ids inválidos" }, { status: 400 })
    }

    const check = await checkOrder(orderId)
    if ("error" in check) {
        return NextResponse.json({ error: check.error }, { status: check.status })
    }

    try {
        const result = await deleteOrderItemInternal(itemId)
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }
        await markModified(orderId)
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error("Error in DELETE /api/pedidos/[id]/items/[itemId]:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
