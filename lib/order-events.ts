// Historia del pedido: quién hizo cada cambio, más las notas del taller.
//
// El registro es EXPLÍCITO: cada camino que muta un pedido llama a logOrderEvent.
// Se evaluó hacerlo con triggers en Postgres y no sirve para esto: el trigger ve
// qué cambió pero no quién lo cambió. La sesión vive en Next, y con el driver
// HTTP de Neon cada consulta va suelta, así que no hay transacción donde dejar
// el actor para que el trigger lo lea.
//
// Un evento que no se puede guardar NO puede voltear la operación: si falla el
// registro de "cambió la fecha", la fecha igual cambió. Se loguea y sigue.

import { sql } from "@/lib/database"
import { auth } from "@/auth"

export type OrderEventKind =
    | "created"
    | "status"
    | "field"
    | "item_added"
    | "item_updated"
    | "item_removed"
    | "materials_consumed"
    | "materials_returned"
    | "invoice"
    | "note"

/**
 * Una foto adjunta a una nota. El archivo vive en el Blob store de Vercel; acá
 * solo pasa la URL. `pathname` es la clave del archivo allá, lo único que sirve
 * para borrarlo.
 */
export interface OrderEventPhoto {
    id: number
    url: string
    pathname: string
    width: number | null
    height: number | null
}

export interface OrderEvent {
    id: number
    actor_name: string
    actor_email: string | null
    kind: OrderEventKind
    field: string | null
    old_value: string | null
    new_value: string | null
    body: string | null
    created_at: string
    /** Solo las notas traen fotos; en el resto de los eventos va vacío. */
    photos: OrderEventPhoto[]
}

/** Quién está actuando. Sin sesión es la API del bot o un proceso automático. */
export async function currentActor(): Promise<{ name: string; email: string | null }> {
    const session = await auth()
    const user = session?.user
    if (!user) return { name: "Sistema", email: null }
    return {
        // El email como último recurso: es feo en pantalla pero es alguien, y
        // "Sistema" en un cambio hecho a mano sería mentir.
        name: user.name?.trim() || user.email?.trim() || "Sistema",
        email: user.email ?? null,
    }
}

/**
 * Devuelve el id del evento guardado, o null si no se pudo guardar. Lo usa la
 * nota con fotos: sin el id no hay a qué colgarlas. El resto de los llamadores
 * lo ignora — un evento que no se pudo registrar no voltea la operación.
 */
export async function logOrderEvent(
    orderId: number,
    event: {
        kind: OrderEventKind
        field?: string | null
        oldValue?: string | null
        newValue?: string | null
        body?: string | null
        /** Para la API y los procesos automáticos, que no tienen sesión. */
        actor?: { name: string; email?: string | null }
    },
): Promise<number | null> {
    try {
        const actor = event.actor ?? (await currentActor())
        const [row] = await sql`
            INSERT INTO order_events (order_id, actor_name, actor_email, kind, field, old_value, new_value, body)
            VALUES (
                ${orderId}, ${actor.name}, ${actor.email ?? null}, ${event.kind},
                ${event.field ?? null}, ${event.oldValue ?? null}, ${event.newValue ?? null},
                ${event.body ?? null}
            )
            RETURNING id
        `
        return (row?.id as number) ?? null
    } catch (error) {
        console.error("No se pudo registrar el evento del pedido:", error)
        return null
    }
}

/** Varios eventos de una, para un cambio que tocó varios campos a la vez. */
export async function logOrderEvents(
    orderId: number,
    events: Parameters<typeof logOrderEvent>[1][],
): Promise<void> {
    for (const e of events) await logOrderEvent(orderId, e)
}

/**
 * Qué se le tocó al pedido DESPUÉS de que el documento quedó al día. Es lo que el
 * aviso de "desactualizada" enumera, para no obligar a nadie a abrir el historial
 * y deducirlo evento por evento.
 *
 * Solo eventos de ítems: son los únicos que cambian lo que dice el documento. Un
 * cambio de prioridad no lo desalinea y meterlo en la lista sería ruido.
 *
 * El corte se hace EN SQL contra la marca de sincronización y no comparando fechas
 * en JS: las dos vienen de Postgres y compararlas allá evita el ida y vuelta de
 * formatos. La consulta está escrita dos veces, una por documento, porque el
 * template de Neon interpola VALORES y no nombres de columna.
 */
export async function listDocumentDrift(
    orderId: number,
    doc: "invoice" | "remission",
): Promise<OrderEvent[]> {
    try {
        const rows =
            doc === "invoice"
                ? await sql`
                    SELECT e.id, e.actor_name, e.actor_email, e.kind, e.field,
                           e.old_value, e.new_value, e.body,
                           e.created_at::text AS created_at
                    FROM order_events e
                    JOIN orders o ON o.id = e.order_id
                    WHERE e.order_id = ${orderId}
                      AND o.invoice_synced_at IS NOT NULL
                      AND e.created_at > o.invoice_synced_at
                      AND e.kind IN ('item_added', 'item_updated', 'item_removed')
                    ORDER BY e.created_at ASC, e.id ASC
                `
                : await sql`
                    SELECT e.id, e.actor_name, e.actor_email, e.kind, e.field,
                           e.old_value, e.new_value, e.body,
                           e.created_at::text AS created_at
                    FROM order_events e
                    JOIN orders o ON o.id = e.order_id
                    WHERE e.order_id = ${orderId}
                      AND o.remission_synced_at IS NOT NULL
                      AND e.created_at > o.remission_synced_at
                      AND e.kind IN ('item_added', 'item_updated', 'item_removed')
                    ORDER BY e.created_at ASC, e.id ASC
                `
        return (rows as Omit<OrderEvent, "photos">[]).map((e) => ({ ...e, photos: [] }))
    } catch (error) {
        // Igual que la historia: si esto falla, el pedido se abre lo mismo. El
        // aviso pierde el detalle, no la advertencia.
        console.error("No se pudo leer qué cambió desde la emisión:", error)
        return []
    }
}

/** El evento contado en una línea: "Se agregó 2 × Optic 1 — Dalila". */
export function describeDrift(e: OrderEvent): string {
    const quien = e.actor_name ? ` — ${e.actor_name}` : ""
    if (e.kind === "item_added") return `Se agregó ${e.new_value}${quien}`
    if (e.kind === "item_removed") return `Se quitó ${e.old_value}${quien}`
    return `${e.body ? `${e.body}: ` : ""}${e.old_value} → ${e.new_value}${quien}`
}

export async function listOrderEvents(orderId: number): Promise<OrderEvent[]> {
    try {
        const rows = await sql`
            SELECT id, actor_name, actor_email, kind, field, old_value, new_value, body,
                   created_at::text AS created_at
            FROM order_events
            WHERE order_id = ${orderId}
            ORDER BY created_at DESC, id DESC
        `
        const eventos = (rows as Omit<OrderEvent, "photos">[]).map((e) => ({ ...e, photos: [] as OrderEventPhoto[] }))

        // Las fotos van en una segunda consulta y no en un JOIN: el JOIN repite
        // la nota una vez por foto y habría que volver a juntarla acá igual.
        // Filtra por order_id en vez de por la lista de ids para no armar un IN
        // con parámetros variables, que el template de Neon no interpola.
        const fotos = await sql`
            SELECT p.id, p.event_id, p.url, p.pathname, p.width, p.height
            FROM order_event_photos p
            JOIN order_events e ON e.id = p.event_id
            WHERE e.order_id = ${orderId}
            ORDER BY p.id ASC
        `
        const porEvento = new Map<number, OrderEventPhoto[]>()
        for (const f of fotos as (OrderEventPhoto & { event_id: number })[]) {
            const { event_id, ...foto } = f
            const lista = porEvento.get(event_id)
            if (lista) lista.push(foto)
            else porEvento.set(event_id, [foto])
        }
        for (const e of eventos) e.photos = porEvento.get(e.id) ?? []

        return eventos
    } catch (error) {
        // La tabla puede no existir todavía (migración 20 sin correr). El detalle
        // del pedido tiene que seguir abriéndose igual: la historia es un extra,
        // no el trabajo.
        console.error("No se pudo leer la historia del pedido:", error)
        return []
    }
}

/**
 * Quién actúa detrás de la API. El bot y el CRM se identifican con la cabecera
 * `X-Actor`; si no la mandan, el evento queda como "API" y NUNCA como una
 * persona: es preferible un actor genérico a atribuirle a alguien algo que no hizo.
 *
 * Hay rutas que además aceptan sesión (el botón de facturar sale del navegador):
 * ahí gana la persona logueada, que es un dato más preciso que la cabecera.
 */
export async function apiActor(request: Request): Promise<{ name: string; email: string | null }> {
    const session = await auth()
    if (session?.user) {
        return {
            name: session.user.name?.trim() || session.user.email?.trim() || "API",
            email: session.user.email ?? null,
        }
    }
    const declarado = request.headers.get("x-actor")?.trim()
    return { name: declarado && declarado.length <= 60 ? declarado : "API", email: null }
}

/** Cuelga las fotos ya subidas al Blob de una nota recién guardada. */
export async function addEventPhotos(
    eventId: number,
    photos: { url: string; pathname: string; width?: number | null; height?: number | null }[],
): Promise<void> {
    for (const f of photos) {
        await sql`
            INSERT INTO order_event_photos (event_id, url, pathname, width, height)
            VALUES (${eventId}, ${f.url}, ${f.pathname}, ${f.width ?? null}, ${f.height ?? null})
        `
    }
}

/** Los pathname de las fotos de una nota. Es lo que hace falta para borrarlas del Blob. */
export async function eventPhotoPaths(eventId: number): Promise<string[]> {
    const rows = await sql`SELECT pathname FROM order_event_photos WHERE event_id = ${eventId}`
    return (rows as { pathname: string }[]).map((r) => r.pathname)
}
