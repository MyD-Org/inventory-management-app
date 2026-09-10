// Entregas parciales de un pedido: cuánto de cada línea ya salió del depósito y
// cuánto falta.
//
// Vive SEPARADO de lib/remissions.ts —que habla con Postgres y con Alegra— por el
// mismo motivo que lib/returns.ts vive separado de lib/order-actions.ts: acá está
// la regla, y se puede testear sin levantar nada. Además lo importan client
// components (la fila del producto, la tarjeta del tablero), y lib/remissions.ts
// arrastra lib/database.ts, que hace throw a nivel de módulo si falta DATABASE_URL.
//
// LA REGLA, en una línea: el tope de una entrega es lo PENDIENTE de esa línea —lo
// pedido menos lo ya remitido—, y no lo pedido. Remitir de más significa que el
// papel dice que salió mercadería que el pedido nunca pidió, y eso no se arregla
// después: el remito es un documento de la contabilidad real, se anula, no se borra.

/** Una línea del pedido, con lo que ya se entregó de ella. */
export interface DeliverableItem {
    id: number
    product: string
    /** Lo pedido. */
    quantity: number
    /** Lo ya remitido, sumando todos los remitos del pedido. */
    delivered: number
}

export interface DeliveryRequestItem {
    orderItemId: number
    quantity: number
}

export type DeliveryState = "sin_entregar" | "parcial" | "entregado"

export const DELIVERY_LABELS: Record<DeliveryState, string> = {
    sin_entregar: "Sin entregar",
    parcial: "Entrega parcial",
    entregado: "Entregado",
}

// Las cantidades son DECIMAL(10,2) en la base y viajan como float. Comparar
// 2.9999999 contra 3 y concluir que falta entregar algo sería mentir por un
// redondeo, así que todo se compara con dos decimales, que es la precisión que la
// columna guarda.
const EPSILON = 0.005

export function round2(n: number): number {
    return Math.round(n * 100) / 100
}

/** Lo que falta entregar de una línea. Nunca negativo: ver deliveredOverflow. */
export function pendingQuantity(item: DeliverableItem): number {
    return Math.max(0, round2(item.quantity - item.delivered))
}

/**
 * Líneas donde se entregó MÁS de lo pedido. Pasa cuando el pedido se achica
 * después de haber remitido —se entregaron 5 y después alguien bajó la línea a 3—.
 * No se corrige solo: el papel ya salió con 5. Lo que corresponde es avisarlo.
 */
export function deliveredOverflow(items: DeliverableItem[]): DeliverableItem[] {
    return items.filter((i) => i.delivered - i.quantity > EPSILON)
}

/** En qué estado de entrega está el pedido entero. */
export function deliveryState(items: DeliverableItem[]): DeliveryState {
    const pedido = items.reduce((s, i) => s + i.quantity, 0)
    const entregado = items.reduce((s, i) => s + i.delivered, 0)
    // Un pedido sin líneas no entregó nada, y decir "entregado" porque 0 >= 0
    // sería marcarlo como salido sin que haya salido nada.
    if (entregado <= EPSILON) return "sin_entregar"
    if (entregado >= pedido - EPSILON) return "entregado"
    return "parcial"
}

/** "4 de 10 entregadas". Lo que se lee en la fila del producto y en la tarjeta. */
export function describeDelivery(items: DeliverableItem[]): string {
    const pedido = round2(items.reduce((s, i) => s + i.quantity, 0))
    const entregado = round2(items.reduce((s, i) => s + i.delivered, 0))
    return `${entregado} de ${pedido} entregadas`
}

/**
 * Qué se va a remitir de verdad, o por qué no se puede.
 *
 * `request` en null significa "todo lo pendiente": es el caso normal —el pedido
 * sale completo— y también lo que hace la emisión automática al pasar a
 * "Preparando entrega", que no tiene a nadie a quien preguntarle cantidades.
 *
 * Se valida TODO antes de emitir nada, igual que planReturn: medio remito emitido
 * deja el pedido peor que no haber hecho nada, y acá "peor" es un documento de más
 * en la contabilidad del cliente.
 */
export function planDelivery(
    items: DeliverableItem[],
    request: DeliveryRequestItem[] | null,
): { items: Array<{ orderItemId: number; product: string; quantity: number }> } | { error: string } {
    if (request === null) {
        const todo = items
            .map((i) => ({ orderItemId: i.id, product: i.product, quantity: pendingQuantity(i) }))
            .filter((l) => l.quantity > 0)
        if (todo.length === 0) {
            return { error: "El pedido ya está entregado por completo: no hay nada que remitir." }
        }
        return { items: todo }
    }

    // Las filas en cero no son un error: el diálogo manda todas las líneas del
    // pedido y quien remite deja en cero lo que todavía no sale.
    const pedido = request.filter((r) => Number.isFinite(r.quantity) && r.quantity > 0)
    if (pedido.length === 0) return { error: "No hay nada para remitir" }

    const porItem = new Map(items.map((i) => [i.id, i]))

    // Una línea repetida se suma antes de comparar contra el tope, igual que en la
    // devolución de materiales: dos filas de 2 contra 3 pendientes son 4.
    const totales = new Map<number, number>()
    for (const r of pedido) {
        totales.set(r.orderItemId, round2((totales.get(r.orderItemId) ?? 0) + r.quantity))
    }

    const errores: string[] = []
    for (const [orderItemId, total] of totales) {
        const item = porItem.get(orderItemId)
        if (!item) {
            errores.push("Hay una línea que no es de este pedido")
            continue
        }
        const pendiente = pendingQuantity(item)
        if (total - pendiente > EPSILON) {
            errores.push(
                pendiente === 0
                    ? `${item.product}: ya está entregado por completo`
                    : `${item.product}: querés remitir ${total} y quedan ${pendiente} por entregar`,
            )
        }
    }
    if (errores.length > 0) return { error: errores.join(". ") }

    return {
        items: [...totales.entries()].map(([orderItemId, quantity]) => ({
            orderItemId,
            product: porItem.get(orderItemId)!.product,
            quantity,
        })),
    }
}
