import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const barcode = searchParams.get("barcode")

    if (!barcode) {
      return NextResponse.json({ error: "Código de barras requerido" }, { status: 400 })
    }

    const result = await sql`
      SELECT 
        m.id,
        m.name,
        m.barcode,
        m.description,
        m.unit_of_measure,
        m.min_stock,
        m.max_stock,
        m.unit_cost,
        i.current_stock,
        i.available_stock,
        i.reserved_stock,
        c.name as category_name,
        s.name as supplier_name
      FROM materials m
      JOIN inventory i ON m.id = i.material_id
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      WHERE m.barcode = ${barcode}
      LIMIT 1
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Material no encontrado" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error looking up material:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
