// Módulo PURO a propósito: no importa lib/database. Lo consumen tanto el
// servidor como components/operator-movements-list.tsx, que es "use client";
// si acá entrara `sql`, database.ts viajaría al navegador y la pantalla se
// rompería con "DATABASE_URL environment variable is not set". La consulta
// vive en lib/operator-movements-query.ts.
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

export interface MovimientoDeLaSemana {
    id: number
    movement_type: string
    quantity: string
    created_at: string
    material_name: string
    user_name: string | null
    // La persona que movió el material, elegida en el modal. Null en los
    // movimientos anteriores a que existieran los operarios y en los que vienen
    // de un pedido. Ver lib/operators.ts.
    operator_name: string | null
    // Lo hizo el usuario que está mirando. Se calcula en SQL para no mandar al
    // cliente la comparación de nombres.
    mine: boolean
    // Se puede deshacer: es suyo, es de HOY (no de toda la semana), no viene de
    // un pedido, no es una corrección y todavía nadie lo corrigió. Las mismas
    // condiciones que valida deshacerMovimiento().
    undoable: boolean
}

