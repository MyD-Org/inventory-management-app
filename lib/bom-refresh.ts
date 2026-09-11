// Qué pedidos se rehacen cuando cambia la ficha de costo de un producto.
//
// El BOM del pedido es una copia CONGELADA de la receta (ver explodeBom): se
// arma al cargar el pedido y desde ahí vive por su cuenta. Eso está bien para lo
// que ya se fabricó —un pedido entregado tiene que seguir diciendo qué salió del
// depósito ese día, no lo que hoy dice la hoja—, pero mientras el pedido todavía
// se está fabricando la copia vieja hace descontar material que la ficha ya
// corrigió. Entonces: al guardar la ficha, los pedidos que todavía no salieron
// se vuelven a explotar.
//
// Vive SEPARADO de lib/orders.ts por el mismo motivo que lib/bom.ts: acá no se
// importa la base, así que la regla —que decide a qué pedidos se les toca la
// lista de materiales— se testea sin levantar Postgres.

import { type OrderStatus } from "@/lib/order-statuses"

// Estados en los que el pedido todavía se está armando y su lista de materiales
// puede cambiar. Es la misma idea que API_EDITABLE_STATUSES: de 'por_facturar'
// en adelante el equipo ya está fabricado y lo que se descuenta es historia,
// aunque el pedido siga sin entregarse.
export const BOM_REFRESHABLE_STATUSES: OrderStatus[] = ["por_revisar", "recibido", "en_proceso"]

// Por qué un pedido NO se rehace:
//   - cerrado: retirado o cancelado. El BOM es historia y no se avisa nada.
//   - consumido: ya se descontó stock. Mismo criterio que updateOrderItemInternal:
//     meter materiales nuevos abajo de un descuento hecho deja los números
//     mintiendo. Se avisa: alguien tiene que mirar el descuento a mano.
//   - en_entrega: el equipo ya está fabricado (preparando entrega, listo para
//     retirar). Se avisa por el mismo motivo.
export type BomRefreshSkipReason = "cerrado" | "consumido" | "en_entrega"

export interface BomRefreshDecision {
    refresh: boolean
    skip: BomRefreshSkipReason | null
}

// El orden de las reglas importa: un pedido retirado que además descontó stock
// es "cerrado" (no se avisa nada), no "consumido" (que pide revisión a mano).
export function bomRefreshDecision(order: { status: string; consumed: boolean }): BomRefreshDecision {
    if (order.status === "retirado" || order.status === "cancelado") {
        return { refresh: false, skip: "cerrado" }
    }
    if (order.consumed) return { refresh: false, skip: "consumido" }
    if (!(BOM_REFRESHABLE_STATUSES as string[]).includes(order.status)) {
        return { refresh: false, skip: "en_entrega" }
    }
    return { refresh: true, skip: null }
}

export interface BomRefreshOrder {
    orderId: number
    /** Cómo lo nombra el taller: la referencia si la tiene, si no el id externo. */
    label: string
}

export interface BomRefreshReport {
    updated: BomRefreshOrder[]
    /** Solo los que hay que mirar a mano: 'cerrado' no entra acá. */
    pending: Array<BomRefreshOrder & { reason: Exclude<BomRefreshSkipReason, "cerrado"> }>
}

const REASON_TEXT: Record<Exclude<BomRefreshSkipReason, "cerrado">, string> = {
    consumido: "ya descontaron stock",
    en_entrega: "ya están fabricados",
}

// El aviso que ve quien guardó la ficha. null = no hay nada que contar (ningún
// pedido en marcha usaba este producto).
export function bomRefreshMessage(report: BomRefreshReport): { title: string; description?: string } | null {
    const { updated, pending } = report
    if (updated.length === 0 && pending.length === 0) return null

    const list = (orders: BomRefreshOrder[]) => orders.map((o) => o.label).join(", ")

    const title =
        updated.length === 0
            ? "Ningún pedido en marcha se actualizó"
            : updated.length === 1
              ? "Se actualizaron los materiales de 1 pedido en marcha"
              : `Se actualizaron los materiales de ${updated.length} pedidos en marcha`

    const partes: string[] = []
    if (updated.length > 0) partes.push(list(updated))

    // Los que no se tocaron se agrupan por motivo: el taller necesita saber cuál
    // mirar a mano y por qué, no una lista suelta de números de pedido.
    for (const reason of ["consumido", "en_entrega"] as const) {
        const afectados = pending.filter((p) => p.reason === reason)
        if (afectados.length === 0) continue
        partes.push(`Sin tocar porque ${REASON_TEXT[reason]}: ${list(afectados)}. Revisá los materiales a mano.`)
    }

    return { title, description: partes.join(" · ") }
}
