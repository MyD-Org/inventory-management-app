import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

// Tool de IA (read-only): busca PRODUCTOS COSTEADOS (tabla budgets) por nombre.
// Sirve para que el agente sepa si un producto ya tiene el costo armado antes de
// crear uno nuevo (y ofrecer actualizarlo). Devuelve el costo calculado y el precio
// de venta sugerido = costo × (1 + margen).
export async function GET(request: NextRequest) {
  const denied = requireInternalSecret(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  const limit = parseLimit(searchParams.get("limit"), 20)

  if (!q) {
    return NextResponse.json({ error: "Falta el parámetro q" }, { status: 400 })
  }

  try {
    const like = `%${q}%`
    const rows = await sql`
      SELECT
        b.id,
        b.name,
        b.description,
        b.status,
        b.margin_pct,
        b.created_at,
        COALESCE(m.total, 0) + COALESCE(l.total, 0) + COALESCE(e.total, 0) AS cost
      FROM budgets b
      LEFT JOIN (SELECT budget_id, SUM(qty * unit_cost) AS total FROM budget_materials GROUP BY budget_id) m ON m.budget_id = b.id
      LEFT JOIN (SELECT budget_id, SUM(hours * hourly_rate) AS total FROM budget_labor GROUP BY budget_id) l ON l.budget_id = b.id
      LEFT JOIN (SELECT budget_id, SUM(amount) AS total FROM budget_extras GROUP BY budget_id) e ON e.budget_id = b.id
      WHERE b.name ILIKE ${like}
      ORDER BY b.name ASC
      LIMIT ${limit}
    `

    const products = rows.map((r: any) => {
      const cost = Number(r.cost)
      const marginPct = Number(r.margin_pct)
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        status: r.status,
        margin_pct: marginPct,
        cost,
        sale_price: Math.round(cost * (1 + marginPct / 100)),
        created_at: r.created_at,
      }
    })

    return NextResponse.json({ count: products.length, products })
  } catch (error) {
    console.error("Error in ai-tools/search-costed-products:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
