"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { PREFIJO_CORRECCION, TZ, notaDeCorreccion } from "@/lib/operator-movements"

// Deshacer NO borra la fila: inserta el movimiento inverso. El historial es un
// registro de lo que pasó, y "me equivoqué y lo corregí" también pasó. Solo se
// puede deshacer lo propio, del día, y que no venga de un pedido: ahí el
// descuento lo maneja el módulo de pedidos y un inverso suelto lo descuadraría.
export async function deshacerMovimiento(movementId: number): Promise<{ ok: boolean; error?: string }> {
    const session = await auth()
    if (!session?.user) return { ok: false, error: "No autenticado" }

    const userName = session.user.name || session.user.email || "Desconocido"

    const [movimiento] = (await sql`
        SELECT id, material_id, movement_type, quantity, user_name, order_id, notes
        FROM stock_movements
        WHERE id = ${movementId}
          AND created_at >= (date_trunc('day', NOW() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})
    `) as any[]

    if (!movimiento) return { ok: false, error: "El movimiento no es de hoy" }
    if (movimiento.user_name !== userName) return { ok: false, error: "Ese movimiento no es tuyo" }
    if (movimiento.order_id) return { ok: false, error: "Viene de un pedido: se deshace desde el pedido" }
    if (!["entrada", "salida"].includes(movimiento.movement_type)) {
        return { ok: false, error: "Solo se deshacen entradas y salidas" }
    }
    if (String(movimiento.notes ?? "").startsWith(PREFIJO_CORRECCION)) {
        return { ok: false, error: "Es una corrección: no se deshace de nuevo" }
    }

    const [yaCorregido] = (await sql`
        SELECT 1 FROM stock_movements WHERE notes = ${notaDeCorreccion(movementId)}
    `) as any[]
    if (yaCorregido) return { ok: false, error: "Ese movimiento ya se deshizo" }

    const [inventario] = (await sql`
        SELECT current_stock FROM inventory WHERE material_id = ${movimiento.material_id}
    `) as any[]
    if (!inventario) return { ok: false, error: "El material ya no está en el inventario" }

    // Number() obligatorio: las columnas son numeric y el driver las devuelve
    // como string. Sin esto la suma concatena ("12.00" + 5 = "12.005").
    const stockActual = Number(inventario.current_stock)
    const cantidad = Math.abs(Number(movimiento.quantity))
    const tipoInverso = movimiento.movement_type === "entrada" ? "salida" : "entrada"
    const nuevoStock = tipoInverso === "salida" ? stockActual - cantidad : stockActual + cantidad

    // Si ya se consumió lo que había entrado, deshacer dejaría el stock en
    // negativo. Mejor frenar y que lo arregle con una salida normal.
    if (nuevoStock < 0) {
        return { ok: false, error: "Ya no hay stock suficiente para deshacerlo" }
    }

    try {
        await sql`
            INSERT INTO stock_movements (
                material_id, movement_type, quantity, previous_stock, new_stock, notes, user_name
            )
            VALUES (
                ${movimiento.material_id},
                ${tipoInverso},
                ${cantidad},
                ${stockActual},
                ${nuevoStock},
                ${notaDeCorreccion(movementId)},
                ${userName}
            )
        `
        await sql`
            UPDATE inventory
            SET current_stock = ${nuevoStock}, last_updated = NOW()
            WHERE material_id = ${movimiento.material_id}
        `
    } catch (error) {
        console.error("Error deshaciendo el movimiento:", error)
        return { ok: false, error: "No se pudo deshacer" }
    }

    revalidatePath("/")
    revalidatePath("/inventory")
    revalidatePath("/movimientos")
    return { ok: true }
}
