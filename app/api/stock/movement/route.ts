import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"

export async function POST(request: NextRequest) {
  try {
    // El usuario que realiza el movimiento se obtiene de la sesión autenticada
    // (fuente de verdad en el servidor). No se confía en un user_name enviado
    // por el cliente, que podría ser falso o quedar hardcodeado.
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const user_name = session.user.name || session.user.email || "Desconocido"

    const body = await request.json()
    const { material_id, movement_type, quantity, reference_number, notes, unit_cost } = body

    // Validaciones
    if (!material_id || !movement_type || !quantity) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (!["entrada", "salida", "ajuste"].includes(movement_type)) {
      return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 })
    }

    // Precio opcional: solo tiene sentido para entradas. Aceptamos number o null;
    // si viene, tiene que ser >= 0. Si es 0 o null lo guardamos como null (evita
    // pisar el unit_cost del material con 0 cuando el usuario deja el campo vacío).
    let unitCost: number | null = null
    if (unit_cost !== undefined && unit_cost !== null && unit_cost !== "") {
      const parsed = Number(unit_cost)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json({ error: "Precio unitario inválido" }, { status: 400 })
      }
      unitCost = parsed > 0 ? parsed : null
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
          user_name,
          unit_cost
        )
        VALUES (
          ${material_id},
          ${movement_type},
          ${quantity},
          ${currentStock},
          ${newStock},
          ${reference_number},
          ${notes},
          ${user_name},
          ${unitCost}
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

      // Política "último precio pisa": si es una entrada con precio, actualizamos
      // el unit_cost del material. Así el costo de fabricación en /costos usa el
      // precio de la última compra sin que el usuario tenga que editar la ficha.
      // El histórico queda en stock_movements por si en el futuro cambiamos a
      // promedio ponderado o FIFO. Para salidas/ajustes no aplica: no representan
      // una compra al proveedor.
      if (movement_type === "entrada" && unitCost !== null) {
        await sql`
          UPDATE materials
          SET unit_cost = ${unitCost}, updated_at = NOW()
          WHERE id = ${material_id}
        `
      }

      // Revalidar las rutas que muestran el inventario
      revalidatePath("/inventory")
      revalidatePath("/materials")
      revalidatePath("/")

      return NextResponse.json({
        success: true,
        movement_id: movementResult[0].id,
        previous_stock: currentStock,
        new_stock: newStock,
        created_at: movementResult[0].created_at,
      })
    } catch (error) {
      throw error
    }
  } catch (error) {
    console.error("Error processing stock movement:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
