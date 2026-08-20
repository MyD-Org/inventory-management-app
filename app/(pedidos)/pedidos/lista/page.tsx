import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { OrdersTable, type OrderRow } from "@/components/orders-table"

export const dynamic = 'force-dynamic';

// Vista de lista, complemento del tablero. Sirve para buscar por cliente y para
// ver los cancelados, que no aparecen en el kanban.
export default async function OrdersListPage({
    searchParams,
}: {
    searchParams: { cliente?: string }
}) {
    const session = await auth()
    const cliente = (searchParams.cliente ?? "").trim()
    const like = `%${cliente}%`

    const rows = cliente
        ? await sql`
            SELECT o.id, o.order_number, o.external_id, o.customer_external_id, o.customer_name,
                   o.status, o.origin, o.priority, o.delivery_date_estimate::text AS delivery_date_estimate, o.source_conversation,
                   o.created_at,
                   COUNT(i.id) AS line_count, COALESCE(SUM(i.quantity), 0) AS units,
                   BOOL_OR(i.needs_review) AS needs_review
            FROM orders o
            LEFT JOIN order_items i ON i.order_id = o.id
            WHERE o.customer_external_id ILIKE ${like} OR o.customer_name ILIKE ${like}
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `
        : await sql`
            SELECT o.id, o.order_number, o.external_id, o.customer_external_id, o.customer_name,
                   o.status, o.origin, o.priority, o.delivery_date_estimate::text AS delivery_date_estimate, o.source_conversation,
                   o.created_at,
                   COUNT(i.id) AS line_count, COALESCE(SUM(i.quantity), 0) AS units,
                   BOOL_OR(i.needs_review) AS needs_review
            FROM orders o
            LEFT JOIN order_items i ON i.order_id = o.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `

    const orders: OrderRow[] = rows.map((r) => ({
        id: r.id,
        order_number: r.order_number,
        external_id: r.external_id,
        customer_external_id: r.customer_external_id,
        customer_name: r.customer_name,
        status: r.status,
        origin: r.origin,
        priority: r.priority,
        delivery_date_estimate: r.delivery_date_estimate,
        source_conversation: r.source_conversation,
        created_at: r.created_at,
        line_count: Number(r.line_count),
        units: Number(r.units),
        needs_review: Boolean(r.needs_review),
    }))

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Lista de pedidos</h1>
                <p className="text-sm text-muted-foreground">Incluye los cancelados, que no van al tablero</p>
            </div>
            <OrdersTable orders={orders} initialFilter={cliente} isAdmin={session?.user?.role === 'admin'} />
        </div>
    )
}
