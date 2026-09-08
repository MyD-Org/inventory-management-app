import { sql } from "@/lib/database"

// Zona horaria fija: el servidor corre en UTC, así que "hoy" tiene que
// calcularse en la hora del taller o a las 21 se cambiaría de día solo.
export const TZ = "America/Argentina/Buenos_Aires"

// Prefijo de las notas del movimiento que compensa a otro. Es también la marca
// que usamos para saber si un movimiento ya se deshizo: no hay columna para eso
// y no vale la pena una migración por un texto.
export const PREFIJO_CORRECCION = "Corrección del movimiento #"

export function notaDeCorreccion(movementId: number) {
    return `${PREFIJO_CORRECCION}${movementId}`
}

export interface MovimientoDelDia {
    id: number
    movement_type: string
    quantity: string
    created_at: string
    material_name: string
    // Se puede deshacer: lo hizo él, es de hoy, no viene de un pedido, no es
    // una corrección y todavía nadie lo corrigió.
    undoable: boolean
}

// Los movimientos que hizo ESTE usuario HOY. El operador no ve el historial
// completo (/movimientos es admin-only) y los movimientos de otra gente no le
// sirven: no puede hacer nada con ellos. Los propios sí, para dos cosas
// concretas —"¿ya lo cargué?" y deshacer lo que cargó mal—.
export async function listarMovimientosDeHoy(userName: string): Promise<MovimientoDelDia[]> {
    try {
        const rows = await sql`
            SELECT
                sm.id,
                sm.movement_type,
                sm.quantity,
                sm.created_at,
                m.name AS material_name,
                (
                    sm.order_id IS NULL
                    AND sm.movement_type IN ('entrada', 'salida')
                    AND COALESCE(sm.notes, '') NOT LIKE ${PREFIJO_CORRECCION + "%"}
                    AND NOT EXISTS (
                        SELECT 1 FROM stock_movements c
                        WHERE c.notes = ${PREFIJO_CORRECCION} || sm.id::text
                    )
                ) AS undoable
            FROM stock_movements sm
            JOIN materials m ON m.id = sm.material_id
            WHERE sm.user_name = ${userName}
              AND sm.created_at >= (date_trunc('day', NOW() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})
            ORDER BY sm.created_at DESC
        `
        return rows as unknown as MovimientoDelDia[]
    } catch (error) {
        console.error("Error listando los movimientos del día:", error)
        return []
    }
}
