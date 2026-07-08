import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

const MOVEMENT_TYPES = new Set(["entrada", "salida", "ajuste"])

// Tool de IA (read-only): últimos movimientos de TODO el inventario, con quién hizo
// cada uno (user_name). Filtros opcionales: type, from, to (YYYY-MM-DD), limit.
// Misma forma de query que downloadMovementsReport (lib/actions.ts).
export async function GET(request: NextRequest) {
  const denied = requireInternalSecret(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const typeRaw = (searchParams.get("type") ?? "").trim()
  const type = MOVEMENT_TYPES.has(typeRaw) ? typeRaw : "all"
  const fromRaw = (searchParams.get("from") ?? "").trim()
  const toRaw = (searchParams.get("to") ?? "").trim()
  const limit = parseLimit(searchParams.get("limit"), 20)

  // Fechas defensivas: inválidas o vacías → sin filtro.
  const fromVal = fromRaw && !Number.isNaN(Date.parse(fromRaw)) ? new Date(fromRaw).toISOString() : null
  const toVal = toRaw && !Number.isNaN(Date.parse(toRaw))
    ? new Date(new Date(toRaw).setHours(23, 59, 59, 999)).toISOString()
    : null

  try {
    const rows = await sql`
      SELECT
        sm.id,
        sm.movement_type,
        sm.quantity,
        sm.previous_stock,
        sm.new_stock,
        sm.reference_number,
        sm.notes,
        sm.user_name,
        sm.created_at,
        m.id AS material_id,
        m.name AS material_name,
        m.barcode
      FROM stock_movements sm
      JOIN materials m ON m.id = sm.material_id
      WHERE (${type}::text = 'all' OR sm.movement_type = ${type}::text)
        AND (${fromVal}::text IS NULL OR sm.created_at >= ${fromVal}::timestamp)
        AND (${toVal}::text IS NULL OR sm.created_at <= ${toVal}::timestamp)
      ORDER BY sm.created_at DESC
      LIMIT ${limit}
    `
    return NextResponse.json({ count: rows.length, movements: rows })
  } catch (error) {
    console.error("Error in ai-tools/recent-movements:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
