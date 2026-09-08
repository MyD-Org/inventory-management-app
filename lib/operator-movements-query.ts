import "server-only"
import { sql } from "@/lib/database"
import {
    LIMITE_MOVIMIENTOS,
    PREFIJO_CORRECCION,
    TZ,
    type MovimientoReciente,
} from "@/lib/operator-movements"

// Los últimos movimientos, sin corte por día ni por semana. Con "esta semana"
// el lunes a la mañana la pantalla arrancaba vacía, justo cuando más se usa, y
// el viernes tenía sesenta filas. Las preguntas del taller —"¿esto ya lo
// cargué?", "¿quién lo sacó?"— son sobre lo reciente, no sobre lo que va del
// lunes; la fecha de cada fila alcanza para ubicarlo en el tiempo.
async function consultar(userName: string, soloPropios: boolean): Promise<MovimientoReciente[]> {
    const rows = await sql`
        SELECT
            sm.id,
            sm.movement_type,
            sm.quantity,
            sm.created_at,
            sm.user_name,
            m.name AS material_name,
            (sm.user_name = ${userName}) AS mine,
            (
                sm.user_name = ${userName}
                AND sm.created_at >= (date_trunc('day', NOW() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})
                AND sm.order_id IS NULL
                AND sm.movement_type IN ('entrada', 'salida')
                AND COALESCE(sm.notes, '') NOT LIKE ${PREFIJO_CORRECCION + "%"}
                AND NOT EXISTS (
                    SELECT 1 FROM stock_movements c
                    WHERE c.notes = ${PREFIJO_CORRECCION} || sm.id::text
                )
            ) AS undoable
        FROM stock_movements sm
        JOIN materials m ON m.id = sm.material_id
        WHERE NOT ${soloPropios}::boolean OR sm.user_name = ${userName}
        ORDER BY sm.created_at DESC
        LIMIT ${LIMITE_MOVIMIENTOS}
    `
    return rows as unknown as MovimientoReciente[]
}

// Dos listas y no una recortada: si se trajeran los últimos 20 de todos y se
// filtrara en el cliente, un día movido el operador abriría "Propios" y vería
// dos filas porque el resto se lo comieron los movimientos de sus compañeros.
export async function listarMovimientosRecientes(
    userName: string,
): Promise<{ propios: MovimientoReciente[]; todos: MovimientoReciente[] }> {
    try {
        const [propios, todos] = await Promise.all([consultar(userName, true), consultar(userName, false)])
        return { propios, todos }
    } catch (error) {
        console.error("Error listando los últimos movimientos:", error)
        return { propios: [], todos: [] }
    }
}
