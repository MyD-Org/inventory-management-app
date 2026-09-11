// Estados del pedido y sus etiquetas. Vive SEPARADO de lib/orders.ts a propósito:
// lo importan client components (el tablero, la lista), y lib/orders.ts importa
// lib/database.ts, que hace throw a nivel de módulo si falta DATABASE_URL. Si un
// client component lo arrastrara, ese throw terminaría en el bundle del navegador
// y la página no cargaría. Acá no hay ninguna importación de servidor.

// Columnas del tablero del taller, en orden.
export const ORDER_STATUSES = [
    "por_revisar",
    "recibido",
    "en_proceso",
    "por_facturar",
    "listo_para_retirar",
    "retirado",
    "cancelado",
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

// 'cancelado' queda fuera del flujo visible del kanban.
export const BOARD_STATUSES = ORDER_STATUSES.filter((s) => s !== "cancelado")

export const STATUS_LABELS: Record<OrderStatus, string> = {
    por_revisar: "Por revisar",
    recibido: "Recibido",
    en_proceso: "En proceso",
    // Cubre los DOS documentos, no solo la factura: es la etapa administrativa del
    // pedido. La clave sigue siendo 'por_facturar' —está guardada en la base y la
    // usan el CRM y el bot—; lo que cambia es cómo se lee.
    por_facturar: "Preparando entrega",
    listo_para_retirar: "Listo para retirar",
    retirado: "Retirado",
    cancelado: "Cancelado",
}

// Lo que ve el cliente a través del bot: sin la jerga interna del taller.
// Estos son los DEFAULTS. El mapa real es configurable desde /pedidos/opciones y
// vive en app_settings.order_customer_status; esto cubre las claves que falten.
export const DEFAULT_CUSTOMER_STATUS: Record<OrderStatus, string> = {
    por_revisar: "Recibido",
    recibido: "Recibido",
    en_proceso: "En fabricación",
    por_facturar: "Preparando entrega",
    listo_para_retirar: "Listo para retirar",
    retirado: "Entregado",
    cancelado: "Cancelado",
}

export function customerStatus(status: string, overrides?: Record<string, string>): string {
    return overrides?.[status] || DEFAULT_CUSTOMER_STATUS[status as OrderStatus] || status
}

export const ORDER_PRIORITIES = ["baja", "normal", "alta"] as const

// El pedido ya salió de las manos del taller: está esperando que lo retiren o ya
// se lo llevaron. Para llegar ahí la factura tiene que estar emitida y TODO
// remitido (ver updateOrderStatus), así que sus líneas ya están facturadas,
// contadas y embaladas. Tocarlas después no completa el pedido: lo desalinea de
// los papeles que ya salieron, y una cantidad que sube deja mercadería sin remito
// en un pedido que el tablero da por listo.
//
// Lo que sí se puede hacer siempre: emitir, actualizar documentos y dejar notas.
// Lo que se congela son las LÍNEAS.
export const CLOSED_STATUSES: OrderStatus[] = ["listo_para_retirar", "retirado"]

/** ¿Se le pueden agregar, cambiar o quitar líneas al pedido? */
export function acceptsItemChanges(status: string): boolean {
    return !CLOSED_STATUSES.includes(status as OrderStatus)
}

export const API_EDITABLE_STATUSES: OrderStatus[] = ["por_revisar", "recibido", "en_proceso"]

export function isApiEditable(status: OrderStatus): boolean {
    return API_EDITABLE_STATUSES.includes(status)
}

export function orderNeedsReview(order: {
    modified_at: string | null
    delivery_date_verified_at: string | null
}): boolean {
    if (!order.modified_at) return false
    if (!order.delivery_date_verified_at) return true
    return new Date(order.modified_at) > new Date(order.delivery_date_verified_at)
}

// Campos de variación que NO se administran: existen siempre y no se pueden
// borrar, ocultar ni volver a crear.
//
// 'other' —"Otras indicaciones"— es el texto libre del pedido: donde va lo que no
// entra en ninguna lista. Sin él no hay dónde escribir un pedido raro, y un pedido
// raro entra igual: se escribe en cualquier lado o se pierde. Que dependa de que
// nadie lo haya borrado es una fragilidad sin ninguna contrapartida —no hay motivo
// para querer sacarlo—.
export const FIXED_SPEC_FIELDS = ["other"] as const

export function isFixedSpecField(key: string): boolean {
    return (FIXED_SPEC_FIELDS as readonly string[]).includes(key)
}
