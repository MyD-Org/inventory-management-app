import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

// Tool de IA (read-only): busca materiales por nombre o código de barras.
// Devuelve id + unit_cost (los usa el agente para armar presupuestos con materialId).
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
        m.id,
        m.name,
        m.barcode,
        m.unit_of_measure,
        m.unit_cost,
        m.min_stock,
        i.current_stock,
        i.available_stock,
        c.name AS category_name,
        s.name AS supplier_name
      FROM materials m
      JOIN inventory i ON i.material_id = m.id
      LEFT JOIN categories c ON c.id = m.category_id
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      WHERE m.name ILIKE ${like} OR m.barcode ILIKE ${like}
      ORDER BY m.name ASC
      LIMIT ${limit}
    `
    return NextResponse.json({ count: rows.length, materials: rows })
  } catch (error) {
    console.error("Error in ai-tools/search-materials:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
