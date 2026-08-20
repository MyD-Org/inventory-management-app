// Estados del pedido y sus etiquetas. Vive SEPARADO de lib/orders.ts a propósito:
// lo importan client components (el tablero, la lista), y lib/orders.ts importa
// lib/database.ts, que hace throw a nivel de módulo si falta DATABASE_URL. Si un
// client component lo arrastrara, ese throw terminaría en el bundle del navegador
// y la página no cargaría. Acá no hay ninguna importación de servidor.

// Columnas del tablero del taller, en orden.
export const ORDER_STATUSES = [
    "recibido",
    "en_proceso",
    "embalado",
    "facturado",
    "listo_para_retirar",
    "retirado",
    "cancelado",
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

// 'cancelado' queda fuera del flujo visible del kanban.
export const BOARD_STATUSES = ORDER_STATUSES.filter((s) => s !== "cancelado")

export const STATUS_LABELS: Record<OrderStatus, string> = {
    recibido: "Recibido",
    en_proceso: "En proceso",
    embalado: "Embalado",
    facturado: "Facturado",
    listo_para_retirar: "Listo para retirar",
    retirado: "Retirado",
    cancelado: "Cancelado",
}

// Lo que ve el cliente a través del bot: sin la jerga interna del taller.
const CUSTOMER_STATUS: Record<OrderStatus, string> = {
    recibido: "Recibido",
    en_proceso: "En fabricación",
    embalado: "En preparación",
    facturado: "En preparación",
    listo_para_retirar: "Listo para retirar",
    retirado: "Entregado",
    cancelado: "Cancelado",
}

export function customerStatus(status: string): string {
    return CUSTOMER_STATUS[status as OrderStatus] ?? status
}

export const ORDER_PRIORITIES = ["baja", "normal", "alta"] as const
