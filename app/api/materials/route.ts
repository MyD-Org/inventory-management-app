// Redirige el driver al Postgres local cuando NEON_LOCAL_PROXY está seteada.
// Sin este import la ruta intenta hablar con Neon y falla ("fetch failed").
import "@/lib/neon-local"
import { neon } from "@neondatabase/serverless"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest) {
  try {
    // El usuario que realiza el movimiento se obtiene de la sesión autenticada
    // (fuente de verdad en el servidor), igual que en app/api/stock/movement/route.ts
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const user_name = session.user.name || session.user.email || "Desconocido"

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

    // Decir QUÉ falta, no que "faltan campos".
    const faltantes = [
      !name && "Nombre del material",
      !barcode?.toString().trim() && "Código de barras",
      !category_id && "Categoría",
      !supplier_id && "Proveedor",
    ].filter(Boolean)

    if (faltantes.length > 0) {
      return NextResponse.json(
        { error: `Falta completar: ${faltantes.join(", ")}` },
        { status: 400 }
      )
    }

    if (min_stock != null && max_stock != null && Number(min_stock) > Number(max_stock)) {
      return NextResponse.json(
        { error: "El stock mínimo no puede ser mayor que el stock máximo" },
        { status: 400 }
      )
    }

    if (unit_cost != null && Number(unit_cost) < 0) {
      return NextResponse.json(
        { error: "El costo no puede ser negativo" },
        { status: 400 }
      )
    }

    // La columna es NOT NULL y UNIQUE: el código es obligatorio. El botón
    // "Generar" del formulario está para cuando todavía no se tiene uno.
    const finalBarcode: string = barcode.toString().trim()

    const existing = await sql`
      SELECT id FROM materials WHERE barcode = ${finalBarcode}
    `
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "El código de barras ya existe" },
        { status: 400 }
      )
    }

    // Insertar el material
    const result = await sql`
      INSERT INTO materials (name, barcode, description, category_id, supplier_id, unit_of_measure, unit_cost, min_stock, max_stock)
      VALUES (${name}, ${finalBarcode}, ${description}, ${category_id}, ${supplier_id}, ${unit_of_measure}, ${unit_cost || 0}, ${min_stock || 10}, ${max_stock || 100})
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
      // previous_stock/new_stock son NOT NULL: sin ellos el alta con stock inicial
      // fallaba entera (el material y el inventario ya habían quedado creados).
      await sql`
        INSERT INTO stock_movements (material_id, movement_type, quantity, previous_stock, new_stock, notes, user_name)
        VALUES (${materialId}, 'entrada', ${initial_stock}, 0, ${initial_stock}, 'Stock inicial', ${user_name})
      `
    }

    return NextResponse.json({ 
      success: true, 
      material_id: materialId,
      message: "Material creado exitosamente" 
    })
  } catch (error) {
    console.error("Error creating material:", error)

    // Traducimos los errores previsibles de Postgres: un "Error al crear el
    // material" no le dice al usuario qué tiene que corregir.
    const { code, column, detail } = (error ?? {}) as {
      code?: string
      column?: string
      detail?: string
    }

    if (code === "23505") {
      return NextResponse.json({ error: "El código de barras ya existe" }, { status: 400 })
    }
    if (code === "23503") {
      return NextResponse.json(
        { error: "La categoría o el proveedor seleccionados ya no existen. Recargá la página." },
        { status: 400 }
      )
    }
    if (code === "23502") {
      return NextResponse.json(
        { error: `Falta un dato obligatorio${column ? `: ${column}` : ""}` },
        { status: 400 }
      )
    }
    if (code === "23514") {
      return NextResponse.json(
        { error: "Alguno de los valores no es válido para el inventario" },
        { status: 400 }
      )
    }
    if (code === "22003" || code === "22P02") {
      return NextResponse.json(
        { error: "Revisá los números cargados (costo y stocks)" },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: "Error al crear el material",
        detail:
          process.env.NODE_ENV === "production" ? undefined : detail || String(error),
      },
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
