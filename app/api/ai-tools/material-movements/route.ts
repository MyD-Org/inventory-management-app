import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

// Tool de IA (read-only): historial de movimientos de UN material (por id o barcode).
// Incluye user_name: quién hizo cada movimiento.
export async function GET(request: NextRequest) {
  const denied = requireInternalSecret(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  // Los params de la tool son opcionales: ai-api renderiza '' cuando faltan.
  const materialIdRaw = (searchParams.get("material_id") ?? "").trim()
  const barcode = (searchParams.get("barcode") ?? "").trim()
  const limit = parseLimit(searchParams.get("limit"), 20)

  const materialId = Number.parseInt(materialIdRaw, 10)
  if (!Number.isFinite(materialId) && !barcode) {
    return NextResponse.json({ error: "Falta material_id o barcode" }, { status: 400 })
  }

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
      WHERE (${Number.isFinite(materialId) ? materialId : null}::int IS NOT NULL AND m.id = ${Number.isFinite(materialId) ? materialId : null}::int)
         OR (${barcode || null}::text IS NOT NULL AND m.barcode = ${barcode || null}::text)
      ORDER BY sm.created_at DESC
      LIMIT ${limit}
    `
    return NextResponse.json({ count: rows.length, movements: rows })
  } catch (error) {
    console.error("Error in ai-tools/material-movements:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
