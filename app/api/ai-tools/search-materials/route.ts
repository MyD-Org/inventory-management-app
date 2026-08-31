import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

// Tool de IA (read-only): busca materiales por nombre o código de barras.
// Devuelve id + unit_cost (los usa el agente para armar presupuestos con materialId)
// y, si el material integra una familia, su family_id y family_name: con eso el
// agente puede ofrecer costear con la familia entera en vez de con el material fijo.
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
        s.name AS supplier_name,
        -- A qué familia pertenece el material, si pertenece a alguna. Es lo que le
        -- permite al agente decidir entre costear con el material suelto o con la
        -- familia entera (build_budget acepta materialId o familyId, no los dos).
        -- Un material puede figurar en varias familias; se devuelve la de menor id
        -- para no obligar al modelo a desempatar.
        fam.family_id,
        fam.family_name
      FROM materials m
      JOIN inventory i ON i.material_id = m.id
      LEFT JOIN categories c ON c.id = m.category_id
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      LEFT JOIN LATERAL (
        SELECT f.id AS family_id, f.name AS family_name
        FROM material_family_options o
        JOIN material_families f ON f.id = o.family_id
        WHERE o.material_id = m.id
        ORDER BY f.id ASC
        LIMIT 1
      ) fam ON TRUE
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
