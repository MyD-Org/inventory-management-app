import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

const ORDERS = new Set(["revenue", "units", "recent"])

// Fecha YYYY-MM-DD en timezone Argentina (DB en UTC; ver sales-summary).
function arDate(daysAgo = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    .format(new Date(Date.now() - daysAgo * 86_400_000))
}

function parseDate(value: string | null): string | null {
  const raw = (value ?? "").trim()
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null
}

// Tool de IA (read-only): ventas por producto sobre el espejo de Alegra. Solo facturas
// no anuladas (mismo criterio que la vista alegra_sales_by_item; las NC no restan acá).
// Filtros: q (nombre parcial), from/to (default: todo el histórico), order, limit.
// Con q además devuelve la serie mensual (para tendencia de ese producto).
export async function GET(request: NextRequest) {
  const denied = requireInternalSecret(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  const like = q ? `%${q}%` : null
  const from = parseDate(searchParams.get("from"))
  const to = parseDate(searchParams.get("to"))
  const orderRaw = (searchParams.get("order") ?? "").trim()
  const order = ORDERS.has(orderRaw) ? orderRaw : "revenue"
  const limit = parseLimit(searchParams.get("limit"), 15)

  try {
    const items = await sql`
      SELECT i.item_name,
             SUM(i.quantity)::float AS units,
             SUM(i.line_total)::float AS revenue,
             COUNT(DISTINCT d.id)::int AS documents,
             MIN(d.issue_date)::text AS first_sale,
             MAX(d.issue_date)::text AS last_sale
      FROM alegra_sales_items i
      JOIN alegra_sales_documents d ON d.id = i.document_id
      WHERE d.doc_type = 'invoice'
        AND LOWER(COALESCE(d.status, '')) NOT LIKE '%anulad%'
        AND (${like}::text IS NULL OR i.item_name ILIKE ${like}::text)
        AND (${from}::date IS NULL OR d.issue_date >= ${from}::date)
        AND (${to}::date IS NULL OR d.issue_date <= ${to}::date)
      GROUP BY i.item_name
      ORDER BY
        CASE WHEN ${order} = 'units' THEN SUM(i.quantity) END DESC NULLS LAST,
        CASE WHEN ${order} = 'recent' THEN MAX(d.issue_date) END DESC NULLS LAST,
        SUM(i.line_total) DESC
      LIMIT ${limit}
    `

    // Con búsqueda puntual sumamos la serie mensual (default: últimos 12 meses)
    // para que la IA pueda hablar de tendencia y estacionalidad.
    const monthly = q
      ? await sql`
          SELECT DATE_TRUNC('month', d.issue_date)::date::text AS month,
                 SUM(i.quantity)::float AS units,
                 SUM(i.line_total)::float AS revenue
          FROM alegra_sales_items i
          JOIN alegra_sales_documents d ON d.id = i.document_id
          WHERE d.doc_type = 'invoice'
            AND LOWER(COALESCE(d.status, '')) NOT LIKE '%anulad%'
            AND i.item_name ILIKE ${like}::text
            AND d.issue_date >= COALESCE(${from}::date, ${arDate(365)}::date)
            AND (${to}::date IS NULL OR d.issue_date <= ${to}::date)
          GROUP BY 1
          ORDER BY 1 ASC
        `
      : []

    return NextResponse.json({ count: items.length, order, items, ...(q ? { monthly } : {}) })
  } catch (error) {
    console.error("Error in ai-tools/sales-by-item:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
