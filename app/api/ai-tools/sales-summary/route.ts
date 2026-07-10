import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"

// Fecha YYYY-MM-DD en timezone Argentina (la DB corre en UTC: usar CURRENT_DATE
// del server correría el día ~3 horas alrededor de la medianoche).
function arDate(daysAgo = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    .format(new Date(Date.now() - daysAgo * 86_400_000))
}

// Normaliza un param de fecha de la tool: vacío o inválido → fallback.
function parseDate(value: string | null, fallback: string): string {
  const raw = (value ?? "").trim()
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : fallback
}

// Tool de IA (read-only): panorama comercial de un período sobre el ESPEJO de Alegra
// (ver scripts/10-alegra-mirror.sql). Default: últimos 30 días. Devuelve facturación,
// notas de crédito, neto, ticket promedio, top productos/clientes, pagos recibidos,
// deuda total por cobrar y hasta qué fecha llegan los datos importados.
export async function GET(request: NextRequest) {
  const denied = requireInternalSecret(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const from = parseDate(searchParams.get("from"), arDate(30))
  const to = parseDate(searchParams.get("to"), arDate(0))

  try {
    const [docs] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE doc_type = 'invoice')::int AS invoices,
        COALESCE(SUM(total) FILTER (WHERE doc_type = 'invoice'), 0)::float AS invoiced,
        COUNT(*) FILTER (WHERE doc_type = 'credit_note')::int AS credit_notes,
        COALESCE(SUM(total) FILTER (WHERE doc_type = 'credit_note'), 0)::float AS credited,
        COALESCE(SUM(CASE WHEN doc_type = 'credit_note' THEN -total ELSE total END), 0)::float AS net
      FROM alegra_sales_documents
      WHERE LOWER(COALESCE(status, '')) NOT LIKE '%anulad%'
        AND issue_date BETWEEN ${from}::date AND ${to}::date
    `

    const topProducts = await sql`
      SELECT i.item_name, SUM(i.quantity)::float AS units, SUM(i.line_total)::float AS revenue
      FROM alegra_sales_items i
      JOIN alegra_sales_documents d ON d.id = i.document_id
      WHERE d.doc_type = 'invoice'
        AND LOWER(COALESCE(d.status, '')) NOT LIKE '%anulad%'
        AND d.issue_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY i.item_name
      ORDER BY revenue DESC
      LIMIT 5
    `

    const topClients = await sql`
      SELECT COALESCE(c.name, d.client_name, 'Sin cliente') AS client,
             SUM(CASE WHEN d.doc_type = 'credit_note' THEN -d.total ELSE d.total END)::float AS revenue,
             COUNT(*) FILTER (WHERE d.doc_type = 'invoice')::int AS invoices
      FROM alegra_sales_documents d
      LEFT JOIN alegra_clients c ON c.id = d.client_id
      WHERE LOWER(COALESCE(d.status, '')) NOT LIKE '%anulad%'
        AND d.issue_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1
      ORDER BY revenue DESC
      LIMIT 5
    `

    const [payments] = await sql`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS total
      FROM alegra_payments
      WHERE LOWER(COALESCE(status, '')) NOT LIKE '%anulad%'
        AND payment_date BETWEEN ${from}::date AND ${to}::date
    `

    const [receivable] = await sql`
      SELECT COUNT(*)::int AS debtors, COALESCE(SUM(balance), 0)::float AS total
      FROM alegra_client_balances
      WHERE balance > 0
    `

    // Frescura del espejo: hasta cuándo hay datos importados (global, no del rango).
    const [freshness] = await sql`
      SELECT (SELECT MAX(issue_date) FROM alegra_sales_documents)::text AS last_invoice_date,
             (SELECT MAX(payment_date) FROM alegra_payments)::text AS last_payment_date
    `

    const avgTicket = docs.invoices > 0 ? Math.round((docs.invoiced / docs.invoices) * 100) / 100 : 0

    return NextResponse.json({
      period: { from, to },
      sales: { ...docs, avg_ticket: avgTicket },
      top_products: topProducts,
      top_clients: topClients,
      payments,
      receivable,
      data_up_to: freshness,
    })
  } catch (error) {
    console.error("Error in ai-tools/sales-summary:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
