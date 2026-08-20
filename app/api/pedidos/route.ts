import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { createOrder, readOrder, validateOrderPayload, type OrderPayload } from "@/lib/orders"

// Pedidos que crea el agente del CRM (§3 del doc). Auth server-to-server con el
// mismo Bearer que los endpoints de ai-tools (middleware.ts excluye /api).
// La lógica vive en lib/orders.ts: la comparte con la vista manual de /pedidos,
// así las dos rutas validan y explotan el BOM exactamente igual.

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
        customer_external_id: String(body?.customer_external_id ?? ""),
        customer_name: body?.customer_name ?? null,
        source_conversation: body?.source_conversation ?? null,
        notes: body?.notes ?? null,
        items: Array.isArray(body?.items) ? body.items : [],
    }

    try {
        const errors = await validateOrderPayload(payload)
        if (errors.length > 0) {
            // Un solo error de campo faltante se devuelve tal cual, para que el
            // mensaje del bot sea directo ("Falta external_id").
            if (errors.length === 1 && errors[0].startsWith("Falta")) {
                return NextResponse.json({ error: errors[0] }, { status: 400 })
            }
            if (errors.length === 1 && errors[0].startsWith("El pedido no tiene")) {
                return NextResponse.json({ error: errors[0] }, { status: 400 })
            }
            return NextResponse.json({ error: "Specs inválidas", details: errors }, { status: 400 })
        }

        const { created, order } = await createOrder(payload)
        return created
            ? NextResponse.json(order, { status: 201 })
            : NextResponse.json({ ...order, idempotent: true }, { status: 200 })
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
