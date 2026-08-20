import { sql } from "@/lib/database"
import { OrdersBoard, type BoardCard } from "@/components/orders-board"

export const dynamic = 'force-dynamic';

// Tablero del taller. Vista principal del módulo: cada columna es un estado y
// las tarjetas se mueven de una a otra. La lista está en /pedidos/lista.
export default async function OrdersBoardPage() {
    const rows = await sql`
        SELECT o.id, o.order_number, o.external_id, o.customer_name, o.customer_external_id,
               o.status, o.priority, o.delivery_date_estimate::text AS delivery_date_estimate, o.created_at,
               COUNT(i.id) AS line_count,
               COALESCE(SUM(i.quantity), 0) AS units,
               BOOL_OR(i.needs_review) AS needs_review
        FROM orders o
        LEFT JOIN order_items i ON i.order_id = o.id
        WHERE o.status <> 'cancelado'
        GROUP BY o.id
        ORDER BY
            CASE o.priority WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
            o.delivery_date_estimate ASC NULLS LAST,
            o.created_at ASC
    `

    const cards: BoardCard[] = rows.map((r) => ({
        id: r.id,
        order_number: r.order_number,
        external_id: r.external_id,
        customer_name: r.customer_name,
        customer_external_id: r.customer_external_id,
        status: r.status,
        priority: r.priority,
        delivery_date_estimate: r.delivery_date_estimate,
        line_count: Number(r.line_count),
        units: Number(r.units),
        needs_review: Boolean(r.needs_review),
    }))

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Tablero</h1>
                <p className="text-sm text-muted-foreground">
                    Arrastrá una tarjeta para cambiarle el estado
                </p>
            </div>
            <OrdersBoard cards={cards} />
        </div>
    )
}
