import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { customerStatus, getSpecs, resolveProduct, validateSpecs } from "@/lib/orders"

// Pedidos que crea el agente del CRM (§3 del doc). Auth server-to-server con el
// mismo Bearer que los endpoints de ai-tools (middleware.ts excluye /api).

interface ItemPayload {
    product?: string
    qty?: number
    specs?: Record<string, unknown>
    notes?: string
}

// Devuelve el pedido completo con sus líneas y el BOM de cada una.
async function readOrder(orderId: number) {
    const [order] = await sql`
        SELECT id, external_id, customer_external_id, customer_name, status,
               source_conversation, notes, created_at, updated_at
        FROM orders WHERE id = ${orderId}
    `
    if (!order) return null

    const items = await sql`
        SELECT id, line_no, budget_id, label, specs, qty, unit_price, needs_review
        FROM order_items WHERE order_id = ${orderId} ORDER BY line_no ASC
    `
    const itemIds = (items as any[]).map((i) => i.id)
    const materials = itemIds.length
        ? await sql`
            SELECT order_item_id, material_id, label, qty_per_unit, qty_total, unit_cost
            FROM order_item_materials
            WHERE order_item_id = ANY(${itemIds})
            ORDER BY id ASC
        `
        : []

    return {
        ...order,
        customer_status: customerStatus(order.status),
        items: (items as any[]).map((i) => ({
            ...i,
            qty: Number(i.qty),
            unit_price: Number(i.unit_price),
            materials: (materials as any[])
                .filter((m) => m.order_item_id === i.id)
                .map(({ order_item_id, ...m }) => ({
                    ...m,
                    qty_per_unit: Number(m.qty_per_unit),
                    qty_total: Number(m.qty_total),
                    unit_cost: Number(m.unit_cost),
                })),
        })),
    }
}

export async function POST(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Body inválido: se esperaba JSON" }, { status: 400 })
    }

    const externalId = String(body?.external_id ?? "").trim()
    const customerExternalId = String(body?.customer_external_id ?? "").trim()
    const items: ItemPayload[] = Array.isArray(body?.items) ? body.items : []

    if (!externalId) return NextResponse.json({ error: "Falta external_id" }, { status: 400 })
    if (!customerExternalId) return NextResponse.json({ error: "Falta customer_external_id" }, { status: 400 })
    if (items.length === 0) return NextResponse.json({ error: "El pedido no tiene items" }, { status: 400 })

    try {
        // Validar las specs de todas las líneas ANTES de escribir nada.
        const vocab = await getSpecs()
        const errors: string[] = []
        items.forEach((item, idx) => {
            if (!String(item?.product ?? "").trim()) errors.push(`Item ${idx + 1}: falta product`)
            const qty = Number(item?.qty ?? 1)
            if (!Number.isFinite(qty) || qty <= 0) errors.push(`Item ${idx + 1}: qty inválida`)
            for (const e of validateSpecs(item?.specs ?? {}, vocab)) errors.push(`Item ${idx + 1}: ${e}`)
        })
        if (errors.length > 0) {
            return NextResponse.json({ error: "Specs inválidas", details: errors }, { status: 400 })
        }

        // Idempotencia: si el external_id ya existe, no insertamos nada y
        // devolvemos el pedido original con 200. Reintentar es seguro.
        const inserted = await sql`
            INSERT INTO orders (external_id, customer_external_id, customer_name, source_conversation, notes)
            VALUES (
                ${externalId},
                ${customerExternalId},
                ${body?.customer_name ?? null},
                ${body?.source_conversation ?? null},
                ${body?.notes ?? null}
            )
            ON CONFLICT (external_id) DO NOTHING
            RETURNING id
        `
        if (inserted.length === 0) {
            const [existing] = await sql`SELECT id FROM orders WHERE external_id = ${externalId}`
            return NextResponse.json(
                { ...(await readOrder(existing.id)), idempotent: true },
                { status: 200 },
            )
        }

        const orderId = inserted[0].id as number

        try {
            for (const [idx, item] of items.entries()) {
                const productName = String(item.product).trim()
                const qty = Number(item.qty ?? 1)
                const resolved = await resolveProduct(productName)

                const [line] = await sql`
                    INSERT INTO order_items (order_id, line_no, budget_id, label, specs, qty, unit_price, needs_review)
                    VALUES (
                        ${orderId},
                        ${idx + 1},
                        ${resolved?.budgetId ?? null},
                        ${resolved?.label ?? productName},
                        ${JSON.stringify(item.specs ?? {})}::jsonb,
                        ${qty},
                        ${resolved?.unitPrice ?? 0},
                        ${resolved === null}
                    )
                    RETURNING id
                `

                // BOM: copia congelada de la receta (budget_materials) de la hoja
                // de costo. Si el producto no matcheó, la línea queda sin BOM y
                // marcada needs_review para que la resuelva el taller.
                if (resolved) {
                    await sql`
                        INSERT INTO order_item_materials (order_item_id, material_id, label, qty_per_unit, qty_total, unit_cost)
                        SELECT ${line.id}, bm.material_id, bm.label, bm.qty, bm.qty * ${qty}, bm.unit_cost
                        FROM budget_materials bm
                        WHERE bm.budget_id = ${resolved.budgetId}
                        ORDER BY bm.id ASC
                    `
                }
            }
        } catch (error) {
            // El driver HTTP de neon no da transacciones interactivas, así que si
            // falla a mitad borramos el pedido (las líneas caen por CASCADE). Sin
            // esto quedaría un pedido incompleto que el external_id impide recrear.
            await sql`DELETE FROM orders WHERE id = ${orderId}`
            throw error
        }

        return NextResponse.json(await readOrder(orderId), { status: 201 })
    } catch (error) {
        console.error("Error in POST /api/pedidos:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

export async function GET(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const customerExternalId = (searchParams.get("customer_external_id") ?? "").trim()

    // Obligatorio a propósito: sin filtro, un bug del bot listaría los pedidos
    // de todos los clientes.
    if (!customerExternalId) {
        return NextResponse.json({ error: "Falta customer_external_id" }, { status: 400 })
    }

    const externalId = (searchParams.get("external_id") ?? "").trim()

    try {
        const rows = externalId
            ? await sql`
                SELECT id FROM orders
                WHERE customer_external_id = ${customerExternalId} AND external_id = ${externalId}
            `
            : await sql`
                SELECT id FROM orders
                WHERE customer_external_id = ${customerExternalId}
                ORDER BY created_at DESC LIMIT 50
            `

        const orders = []
        for (const r of rows as any[]) orders.push(await readOrder(r.id))
        return NextResponse.json({ count: orders.length, orders })
    } catch (error) {
        console.error("Error in GET /api/pedidos:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
