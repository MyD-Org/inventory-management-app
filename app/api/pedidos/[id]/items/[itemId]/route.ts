import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { deleteOrderItemInternal, diffSpecs, markInvoiceStale, readOrder, updateOrderItemInternal } from "@/lib/orders"
import { isApiEditable } from "@/lib/order-statuses"
import { apiActor, logOrderEvent } from "@/lib/order-events"

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
    // Si el pedido ya estaba facturado, la factura quedó vieja. El CRM edita por
    // acá, así que sin esto un cambio del CRM desalinea la factura sin avisar.
    await markInvoiceStale(orderId)
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
        // El producto se lee ANTES de tocarlo, para poder nombrarlo en la historia.
        const [previo] = await sql`SELECT product, quantity, specs FROM order_items WHERE id = ${itemId}`
        const result = await updateOrderItemInternal(itemId, {
            quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
            specs: body.specs,
        })
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }
        await markModified(orderId)
        const cambioCantidad =
            body.quantity !== undefined && Number(body.quantity) !== Number(previo?.quantity)
        // El hilo dice qué opción se tocó y de qué a qué, igual que cuando el
        // cambio lo hace una persona desde la web.
        const diff = body.specs
            ? await diffSpecs((previo?.specs ?? {}) as Record<string, string>, body.specs)
            : []
        await logOrderEvent(orderId, {
            kind: "item_updated",
            field: cambioCantidad ? "quantity" : "specs",
            oldValue: cambioCantidad
                ? `${previo?.quantity} × ${previo?.product}`
                : diff.map((d) => `${d.label} ${d.antes}`).join(", ") || previo?.product || null,
            newValue: cambioCantidad
                ? `${Number(body.quantity)} × ${previo?.product}`
                : diff.map((d) => `${d.label} ${d.despues}`).join(", ") || previo?.product || null,
            // El producto va aparte cuando el antes/después son los valores.
            body: cambioCantidad || diff.length === 0 ? null : (previo?.product ?? null),
            actor: await apiActor(request),
        })
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
        const [previo] = await sql`SELECT product, quantity FROM order_items WHERE id = ${itemId}`
        const result = await deleteOrderItemInternal(itemId)
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }
        await markModified(orderId)
        await logOrderEvent(orderId, {
            kind: "item_removed",
            oldValue: previo ? `${previo.quantity} × ${previo.product}` : null,
            actor: await apiActor(request),
        })
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error("Error in DELETE /api/pedidos/[id]/items/[itemId]:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
