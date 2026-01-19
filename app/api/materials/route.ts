import { neon } from "@neondatabase/serverless"
import { NextRequest, NextResponse } from "next/server"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      barcode,
      description,
      category_id,
      supplier_id,
      unit_of_measure,
      unit_cost,
      min_stock,
      max_stock,
      initial_stock,
    } = body

    if (!name || !category_id || !supplier_id) {
      return NextResponse.json(
        { error: "Nombre, categoría y proveedor son obligatorios" },
        { status: 400 }
      )
    }

    // Verificar si el código de barras ya existe
    if (barcode) {
      const existing = await sql`
        SELECT id FROM materials WHERE barcode = ${barcode}
      `
      if (existing.length > 0) {
        return NextResponse.json(
          { error: "El código de barras ya existe" },
          { status: 400 }
        )
      }
    }

    // Insertar el material
    const result = await sql`
      INSERT INTO materials (name, barcode, description, category_id, supplier_id, unit_of_measure, unit_cost, min_stock, max_stock)
      VALUES (${name}, ${barcode}, ${description}, ${category_id}, ${supplier_id}, ${unit_of_measure}, ${unit_cost || 0}, ${min_stock || 10}, ${max_stock || 100})
      RETURNING id
    `

    const materialId = result[0].id

    // Crear registro de inventario con stock inicial
    await sql`
      INSERT INTO inventory (material_id, current_stock)
      VALUES (${materialId}, ${initial_stock || 0})
    `

    // Si hay stock inicial, registrar el movimiento
    if (initial_stock && initial_stock > 0) {
      await sql`
        INSERT INTO stock_movements (material_id, movement_type, quantity, notes, performed_by)
        VALUES (${materialId}, 'entrada', ${initial_stock}, 'Stock inicial', 'Sistema')
      `
    }

    return NextResponse.json({ 
      success: true, 
      material_id: materialId,
      message: "Material creado exitosamente" 
    })
  } catch (error) {
    console.error("Error creating material:", error)
    return NextResponse.json(
      { error: "Error al crear el material" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const materials = await sql`
      SELECT m.*, c.name as category_name, s.name as supplier_name, i.current_stock
      FROM materials m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      LEFT JOIN inventory i ON m.id = i.material_id
      ORDER BY m.name
    `
    return NextResponse.json(materials)
  } catch (error) {
    console.error("Error fetching materials:", error)
    return NextResponse.json({ error: "Error al obtener materiales" }, { status: 500 })
  }
}
