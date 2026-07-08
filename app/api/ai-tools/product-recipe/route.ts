import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"

// Tool de IA (read-only): devuelve la RECETA de un producto costeado (budget): sus
// materiales, mano de obra y otros costos. Para cada material del inventario agrega el
// stock actual, el mínimo y el costo unitario VIGENTE (para detectar faltantes o costo 0).
// Parámetros: id (del budget) o name (nombre exacto, case-insensitive).
export async function GET(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const idParam = Number.parseInt(searchParams.get("id") ?? "", 10)
    const name = (searchParams.get("name") ?? "").trim()

    try {
        let budgetId: number | null = Number.isFinite(idParam) ? idParam : null
        if (budgetId === null && name) {
            const found = await sql`SELECT id FROM budgets WHERE lower(name) = lower(${name}) ORDER BY id DESC LIMIT 1`
            budgetId = found[0]?.id ?? null
        }
        if (budgetId === null) {
            return NextResponse.json({ error: "Falta id o name de un producto costeado" }, { status: 400 })
        }

        const [budget] = await sql`SELECT id, name, description, status, margin_pct FROM budgets WHERE id = ${budgetId}`
        if (!budget) return NextResponse.json({ error: "Producto costeado no encontrado" }, { status: 404 })

        const materials = await sql`
            SELECT
                bm.label,
                bm.qty,
                bm.unit_cost AS unit_cost_snapshot,
                bm.material_id,
                m.unit_cost AS unit_cost_actual,
                i.current_stock,
                m.min_stock,
                (i.current_stock IS NOT NULL AND i.current_stock <= m.min_stock) AS bajo_minimo,
                (bm.unit_cost = 0) AS costo_cero
            FROM budget_materials bm
            LEFT JOIN materials m ON m.id = bm.material_id
            LEFT JOIN inventory i ON i.material_id = bm.material_id
            WHERE bm.budget_id = ${budgetId}
            ORDER BY bm.id ASC
        `
        const labor = await sql`SELECT label, hours, hourly_rate FROM budget_labor WHERE budget_id = ${budgetId} ORDER BY id ASC`
        const extras = await sql`SELECT label, amount FROM budget_extras WHERE budget_id = ${budgetId} ORDER BY id ASC`

        const materialsCost = materials.reduce((s: number, r: any) => s + Number(r.qty) * Number(r.unit_cost_snapshot), 0)
        const laborCost = labor.reduce((s: number, r: any) => s + Number(r.hours) * Number(r.hourly_rate), 0)
        const extrasCost = extras.reduce((s: number, r: any) => s + Number(r.amount), 0)
        const cost = materialsCost + laborCost + extrasCost
        const marginPct = Number(budget.margin_pct)

        return NextResponse.json({
            id: budget.id,
            name: budget.name,
            status: budget.status,
            margin_pct: marginPct,
            cost,
            sale_price: Math.round(cost * (1 + marginPct / 100)),
            materials,
            labor,
            extras,
        })
    } catch (error) {
        console.error("Error in ai-tools/product-recipe:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
