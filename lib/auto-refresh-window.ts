// Cuándo el tablero tiene permitido pedir datos nuevos solo.
//
// Vive acá y no adentro del hook para poder testear los bordes sin montar un
// componente: el horario es lo único con casos límite (las 7 en punto, las 19
// en punto, el sábado) y es donde un error se paga caro. Si la ventana quedara
// abierta de más, la base nunca suspendería y Neon cobra por tiempo de compute
// encendido, no por consulta.

/** Horario del taller, en la hora local de la máquina que muestra la pantalla. */
export const START_HOUR = 7
export const END_HOUR = 19

/** Lunes a viernes, de START_HOUR en punto a END_HOUR en punto. Las 19:00 ya
 *  quedan afuera: a esa hora el taller cerró y la pantalla no la mira nadie. */
export function withinWorkHours(now: Date): boolean {
    const day = now.getDay()
    // 0 domingo, 6 sábado.
    if (day === 0 || day === 6) return false
    const hour = now.getHours()
    return hour >= START_HOUR && hour < END_HOUR
}
