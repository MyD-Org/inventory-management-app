import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

const ORDERS = new Set(["balance", "oldest_payment", "recent_invoice"])

// Tool de IA (read-only): cobranzas pendientes. Lee la MV alegra_client_balances:
// balance = facturas/ND con status "Por cobrar" (criterio binario de Alegra, matchea su
// reporte de Cuentas por cobrar); billed/paid son históricos para KPIs. Filtros: q
// (nombre de cliente parcial), min_balance (default 1: solo deudores), order y limit.
export async function GET(request: NextRequest) {
  const denied = requireInternalSecret(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  const like = q ? `%${q}%` : null
  const minBalanceRaw = Number.parseFloat(searchParams.get("min_balance") ?? "")
  const minBalance = Number.isFinite(minBalanceRaw) ? minBalanceRaw : 1
  const orderRaw = (searchParams.get("order") ?? "").trim()
  const order = ORDERS.has(orderRaw) ? orderRaw : "balance"
  const limit = parseLimit(searchParams.get("limit"), 20)

  try {
    const rows = await sql`
      SELECT client_id,
             name,
             billed::float AS billed,
             paid::float AS paid,
             balance::float AS balance,
             last_invoice_date::text AS last_invoice_date,
             last_payment_date::text AS last_payment_date
      FROM alegra_client_balances
      WHERE balance >= ${minBalance}
        AND (${like}::text IS NULL OR name ILIKE ${like}::text)
      ORDER BY
        CASE WHEN ${order} = 'oldest_payment' THEN last_payment_date END ASC NULLS FIRST,
        CASE WHEN ${order} = 'recent_invoice' THEN last_invoice_date END DESC NULLS LAST,
        balance DESC
      LIMIT ${limit}
    `

    // Totales del universo (no del limit) para que la IA pueda contextualizar.
    const [totals] = await sql`
      SELECT COUNT(*)::int AS debtors,
             COALESCE(SUM(balance), 0)::float AS total_balance
      FROM alegra_client_balances
      WHERE balance >= ${minBalance}
        AND (${like}::text IS NULL OR name ILIKE ${like}::text)
    `

    return NextResponse.json({ count: rows.length, order, totals, clients: rows })
  } catch (error) {
    console.error("Error in ai-tools/receivables:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
