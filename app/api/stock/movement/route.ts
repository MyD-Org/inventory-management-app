import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { material_id, movement_type, quantity, reference_number, notes, user_name } = body

    // Validaciones
    if (!material_id || !movement_type || !quantity || !user_name) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (!["entrada", "salida", "ajuste"].includes(movement_type)) {
      return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 })
    }

    // Obtener stock actual
    const currentInventory = await sql`
      SELECT current_stock, available_stock 
      FROM inventory 
      WHERE material_id = ${material_id}
    `

    if (currentInventory.length === 0) {
      return NextResponse.json({ error: "Material no encontrado en inventario" }, { status: 404 })
    }

    const currentStock = currentInventory[0].current_stock
    const availableStock = currentInventory[0].available_stock

    // Validar stock suficiente para salidas
    if (movement_type === "salida" && Math.abs(quantity) > availableStock) {
      return NextResponse.json({ error: `Stock insuficiente. Disponible: ${availableStock}` }, { status: 400 })
    }

    // Calcular nuevo stock
    let newStock = currentStock
    if (movement_type === "entrada") {
      newStock = currentStock + Math.abs(quantity)
    } else if (movement_type === "salida") {
      newStock = currentStock - Math.abs(quantity)
    } else if (movement_type === "ajuste") {
      newStock = Math.abs(quantity) // Para ajustes, quantity es el nuevo stock total
    }

    // Asegurar que el stock no sea negativo
    if (newStock < 0) {
      return NextResponse.json({ error: "El stock no puede ser negativo" }, { status: 400 })
    }

    // Iniciar transacción
    await sql`BEGIN`

    try {
      // Registrar el movimiento
      const movementResult = await sql`
        INSERT INTO stock_movements (
          material_id, 
          movement_type, 
          quantity, 
          previous_stock, 
          new_stock, 
          reference_number, 
          notes, 
          user_name
        )
        VALUES (
          ${material_id},
          ${movement_type},
          ${quantity},
          ${currentStock},
          ${newStock},
          ${reference_number},
          ${notes},
          ${user_name}
        )
        RETURNING id, created_at
      `

      // Actualizar el inventario
      await sql`
        UPDATE inventory 
        SET 
          current_stock = ${newStock},
          last_updated = NOW()
        WHERE material_id = ${material_id}
      `

      // Confirmar transacción
      await sql`COMMIT`

      return NextResponse.json({
        success: true,
        movement_id: movementResult[0].id,
        previous_stock: currentStock,
        new_stock: newStock,
        created_at: movementResult[0].created_at,
      })
    } catch (error) {
      // Revertir transacción en caso de error
      await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Error processing stock movement:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
