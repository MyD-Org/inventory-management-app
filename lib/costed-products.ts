import { sql } from "@/lib/database"
import type { CostedProduct } from "@/components/quote-editor"

// Productos con su costo de fabricación calculado (tabla budgets) + precio de venta
// sugerido = costo × (1 + margen). Se usa como catálogo de productos cotizables.
export async function getCostedProducts(): Promise<CostedProduct[]> {
    const rows = await sql`
        SELECT
            b.id, b.name, b.description, b.margin_pct,
            COALESCE(m.total, 0) + COALESCE(l.total, 0) + COALESCE(e.total, 0) AS cost
        FROM budgets b
        LEFT JOIN (SELECT budget_id, SUM(qty * unit_cost) AS total FROM budget_materials GROUP BY budget_id) m ON m.budget_id = b.id
        LEFT JOIN (SELECT budget_id, SUM(hours * hourly_rate) AS total FROM budget_labor GROUP BY budget_id) l ON l.budget_id = b.id
        LEFT JOIN (SELECT budget_id, SUM(amount) AS total FROM budget_extras GROUP BY budget_id) e ON e.budget_id = b.id
        ORDER BY b.name ASC
    `
    return rows.map((r) => {
        const cost = Number(r.cost)
        const marginPct = Number(r.margin_pct)
        return {
            id: r.id,
            name: r.name,
            description: r.description ?? "",
            cost,
            marginPct,
            salePrice: Math.round(cost * (1 + marginPct / 100)),
        }
    })
}
