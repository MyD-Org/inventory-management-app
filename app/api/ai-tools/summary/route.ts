import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"

// Tool de IA (read-only): resumen general del inventario.
export async function GET(request: NextRequest) {
  const denied = requireInternalSecret(request)
  if (denied) return denied

  try {
    const [totals] = await sql`
      SELECT
        COUNT(*)::int AS total_materials,
        COALESCE(SUM(i.current_stock * m.unit_cost), 0)::numeric(14,2) AS total_value,
        COUNT(*) FILTER (WHERE i.current_stock <= m.min_stock)::int AS low_stock_count,
        COUNT(*) FILTER (WHERE i.current_stock = 0)::int AS out_of_stock_count
      FROM materials m
      JOIN inventory i ON i.material_id = m.id
    `
    const [recent] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE sm.created_at >= NOW() - INTERVAL '7 days')::int AS movements_last_7_days,
        COUNT(*) FILTER (WHERE sm.movement_type = 'entrada' AND sm.created_at >= NOW() - INTERVAL '7 days')::int AS entradas_last_7_days,
        COUNT(*) FILTER (WHERE sm.movement_type = 'salida' AND sm.created_at >= NOW() - INTERVAL '7 days')::int AS salidas_last_7_days
      FROM stock_movements sm
    `
    return NextResponse.json({ ...totals, ...recent })
  } catch (error) {
    console.error("Error in ai-tools/summary:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
