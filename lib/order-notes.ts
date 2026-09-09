// Cuándo una nota tiene algo que mostrar.
//
// Vive acá y no en el componente porque la regla se aplica en tres lugares —
// el hilo de actividad, el contador de "Actividad (11)" y la versión impresa —
// y ya se desincronizó una vez: cuando las notas empezaron a aceptar fotos, el
// filtro seguía pidiendo texto y una nota que era solo una foto no se dibujaba
// en ninguna parte, aunque estuviera guardada.

import type { OrderEvent } from "@/lib/order-events"

/**
 * Una nota vacía no se dibuja: el recuadro ocupaba media pantalla para no decir
 * nada. Pasó con las notas viejas migradas, que no tienen cuerpo.
 *
 * Una foto cuenta como contenido: "así llegó la pieza" puede no tener una sola
 * letra y es justamente lo que se vino a ver.
 */
export function noteHasContent(e: Pick<OrderEvent, "body" | "photos">): boolean {
    return Boolean(e.body?.trim()) || e.photos.length > 0
}

/** El evento se muestra en el hilo: los cambios siempre, las notas si dicen algo. */
export function eventIsVisible(e: OrderEvent): boolean {
    return e.kind !== "note" || noteHasContent(e)
}
