import { sql } from "@/lib/database"
import { getSpecs } from "@/lib/orders"
import type { OrderStatus } from "@/lib/order-statuses"
import { summarizeProduction, type ProductionLine, type ProductionSummary } from "@/lib/production-summary"

export async function productionSummary(statuses: OrderStatus[]): Promise<ProductionSummary> {
    const [rows, vocab] = await Promise.all([
        sql`
            SELECT o.id AS order_id, o.order_number, o.status,
                   COALESCE(o.customer_name, o.customer_external_id) AS customer_name,
                   o.delivery_date_estimate::text AS delivery_date_estimate,
                   i.budget_id, i.specs, i.quantity, i.delivered_quantity,
                   -- El nombre de la ficha y no el de la línea: dos pedidos pueden
                   -- haber escrito distinto el mismo producto.
                   COALESCE(b.name, i.product) AS product
            FROM orders o
            JOIN order_items i ON i.order_id = o.id
            LEFT JOIN budgets b ON b.id = i.budget_id
            WHERE o.status = ANY(${statuses})
            ORDER BY o.order_number, i.line_no
        `,
        // Las mismas columnas que la tabla del pedido (ver pedidos/[id]/page.tsx):
        // las variaciones internas no van como columna ahí, y acá tampoco.
        getSpecs({ soloCliente: true }),
    ])

    const lines: ProductionLine[] = (rows as any[]).map((r) => ({
        order_id: r.order_id,
        order_number: r.order_number,
        customer_name: r.customer_name,
        status: r.status,
        delivery_date_estimate: r.delivery_date_estimate,
        budget_id: r.budget_id,
        product: r.product,
        specs: (r.specs ?? {}) as Record<string, string>,
        quantity: Number(r.quantity),
        delivered: Number(r.delivered_quantity),
    }))

    return summarizeProduction(lines, vocab)
}
