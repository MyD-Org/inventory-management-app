import "server-only"
import { sql } from "@/lib/database"
import { PREFIJO_CORRECCION, TZ, type MovimientoDeLaSemana } from "@/lib/operator-movements"

// Los movimientos de la SEMANA (desde el lunes), de todo el mundo, con la marca
// de cuáles son propios para poder filtrarlos en la pantalla. Antes era solo el
// día y solo lo propio: servía para "¿ya lo cargué?" pero no para el caso real
// de "alguien sacó esto, ¿quién y cuándo?". El filtro deja las dos lecturas.
export async function listarMovimientosDeLaSemana(userName: string): Promise<MovimientoDeLaSemana[]> {
    try {
        const rows = await sql`
            SELECT
                sm.id,
                sm.movement_type,
                sm.quantity,
                sm.created_at,
                sm.user_name,
                sm.operator_name,
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
            WHERE sm.created_at >= (
                -- date_trunc('week') en Postgres arranca el LUNES, que es lo que
                -- vale en el taller: "esta semana" es desde que se abrió.
                date_trunc('week', NOW() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ}
            )
            ORDER BY sm.created_at DESC
        `
        return rows as unknown as MovimientoDeLaSemana[]
    } catch (error) {
        console.error("Error listando los movimientos de la semana:", error)
        return []
    }
}
