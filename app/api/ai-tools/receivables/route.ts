import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"
import { isAlegraConfigured, listClientOpenInvoices } from "@/lib/alegra"

const ORDERS = new Set(["balance", "oldest_payment", "recent_invoice"])

// Tool de IA (read-only): cobranzas pendientes. Lee la MV alegra_client_balances:
// balance = saldo real de facturas/ND "Por cobrar" (total − paid_amount; Alegra tiene
// pagos parciales, ver recomputePaidAmounts en lib/alegra-import.ts); billed/paid son
// históricos para KPIs. Filtros: q (nombre de cliente parcial), min_balance (default 1:
// solo deudores), order y limit.
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

  // Detalle de un cliente: contra Alegra, no contra el espejo.
  const detail = (searchParams.get("detail") ?? "").trim()
  if (detail) {
    if (!isAlegraConfigured()) {
      return NextResponse.json({ error: "Alegra no está configurado" }, { status: 503 })
    }
    try {
      // El nombre lo resolvemos en el espejo (ILIKE, que Alegra no ofrece) y con el
      // alegra_id vamos a la API. Si hay varios matches devolvemos las opciones en vez
      // de elegir uno: la IA no debe adivinar de qué cliente hablar.
      const matches = await sql`
        SELECT id, name, alegra_id FROM alegra_clients
        WHERE alegra_id IS NOT NULL AND name ILIKE ${`%${detail}%`}
        ORDER BY name LIMIT 10
      `
      if (matches.length === 0) {
        return NextResponse.json({ detail, found: false, clients: [] })
      }
      if (matches.length > 1) {
        return NextResponse.json({
          detail,
          ambiguous: true,
          clients: matches.map((m: any) => ({ name: m.name })),
        })
      }

      const client = matches[0]
      const invoices = await listClientOpenInvoices(Number(client.alegra_id))
      const lines = invoices.map((inv: any) => ({
        code: inv.numberTemplate?.fullNumber ?? inv.number ?? null,
        issue_date: inv.date ?? null,
        due_date: inv.dueDate ?? null,
        total: Number(inv.total) || 0,
        paid: Number(inv.totalPaid) || 0,
        outstanding: Number(inv.balance) || 0,
      }))
      const balance = Math.round(lines.reduce((a, l) => a + l.outstanding, 0) * 100) / 100

      return NextResponse.json({
        source: "alegra_live",
        client: { name: client.name, alegra_id: Number(client.alegra_id) },
        balance,
        open_invoices: lines.length,
        invoices: lines,
      })
    } catch (error) {
      console.error("Error in ai-tools/receivables?detail:", error)
      return NextResponse.json({ error: "No se pudo consultar Alegra" }, { status: 502 })
    }
  }

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

    return NextResponse.json({ source: "espejo", count: rows.length, order, totals, clients: rows })
  } catch (error) {
    console.error("Error in ai-tools/receivables:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
