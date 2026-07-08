import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

// Tool de IA (read-only): materiales con stock actual <= stock mínimo.
export async function GET(request: NextRequest) {
  const denied = requireInternalSecret(request)
  if (denied) return denied

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"), 50)

  try {
    const rows = await sql`
      SELECT
        m.id,
        m.name,
        m.barcode,
        m.unit_of_measure,
        m.min_stock,
        i.current_stock,
        i.available_stock,
        c.name AS category_name
      FROM materials m
      JOIN inventory i ON i.material_id = m.id
      LEFT JOIN categories c ON c.id = m.category_id
      WHERE i.current_stock <= m.min_stock
      ORDER BY (i.current_stock - m.min_stock) ASC, m.name ASC
      LIMIT ${limit}
    `
    return NextResponse.json({ count: rows.length, materials: rows })
  } catch (error) {
    console.error("Error in ai-tools/low-stock:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
