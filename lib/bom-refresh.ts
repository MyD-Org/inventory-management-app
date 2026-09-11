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

// A quién se le rehace el BOM y a quién no, decidido de una vez sobre TODOS los
// pedidos que usan la ficha. Separar el reparto de la consulta es lo que permite
// testear la parte que importa —la clasificación y cómo se nombra cada pedido—
// sin levantar Postgres.
//
// `refresh` son los que hay que volver a explotar; `pending` los que quedaron
// sin tocar y alguien tiene que mirar. Cuáles terminaron efectivamente
// actualizados lo sabe el que explota (una línea puede fallar), así que
// `updated` lo arma el llamador.
export interface BomRefreshCandidate {
    orderId: number
    externalId: string
    reference: string | null
    status: string
    consumed: boolean
}

export interface BomRefreshPlan {
    refresh: BomRefreshOrder[]
    pending: BomRefreshReport["pending"]
}

// Cómo lo nombra el taller: la referencia si la tiene cargada, si no el id con
// el que entró desde el CRM. Nunca el id interno, que no le dice nada a nadie.
export function bomRefreshLabel(order: { externalId: string; reference: string | null }): string {
    return order.reference?.trim() || String(order.externalId)
}

export function planBomRefresh(candidates: BomRefreshCandidate[]): BomRefreshPlan {
    const plan: BomRefreshPlan = { refresh: [], pending: [] }

    for (const candidate of candidates) {
        const orden: BomRefreshOrder = { orderId: candidate.orderId, label: bomRefreshLabel(candidate) }
        const decision = bomRefreshDecision(candidate)

        if (decision.refresh) {
            plan.refresh.push(orden)
            continue
        }
        // 'cerrado' no se reporta: el BOM de un pedido retirado o cancelado es
        // historia, no algo pendiente de revisar.
        if (decision.skip && decision.skip !== "cerrado") {
            plan.pending.push({ ...orden, reason: decision.skip })
        }
    }

    return plan
}

// ---------- Huella de la receta ----------

// Una línea de la lista de materiales de la ficha, como vuelve de la base.
// Los numeric llegan como string desde el driver (ver 32-stock-decimal.sql), de
// ahí la unión.
export interface BomFingerprintRow {
    material_id: number | string | null
    label: string
    qty: number | string
    spec_field_key: string | null
    family_id: number | string | null
    options: Array<{ v: string; m: number | string | null; q: number | string | null }>
}

const num = (v: number | string | null | undefined): number | null =>
    v === null || v === undefined || v === "" ? null : Number(v)

// Huella de la RECETA: qué material sale, cuánto, con qué nombre y qué variantes.
// Sirve para saber si un guardado de la ficha cambió lo que se va a descontar
// del depósito o solo el resto (margen, mano de obra, descripción).
//
// Hace falta porque las líneas se reemplazan enteras en cada guardado (delete +
// insert): los ids son nuevos siempre, así que sin comparar contenido no hay
// forma de distinguir un cambio real de un guardado que no tocó nada — y
// re-explotar de gusto llenaría de eventos el historial de todos los pedidos en
// marcha.
//
// NO incluye unit_cost: el costo de la hoja no cambia qué se descuenta, y en el
// BOM del pedido ni siquiera se copia. Cambiar el precio de un material no tiene
// por qué tocar ningún pedido.
//
// El orden lo pone esta función y no el ORDER BY: dos guardados con las mismas
// líneas en distinto orden son la misma receta, y las cantidades se normalizan a
// número porque el driver puede devolver "2.00" donde antes devolvía "2".
export function bomFingerprint(rows: BomFingerprintRow[]): string {
    const lines = rows.map((r) => ({
        material_id: num(r.material_id),
        label: r.label?.trim() ?? "",
        qty: num(r.qty),
        spec_field_key: r.spec_field_key?.trim() || null,
        family_id: num(r.family_id),
        options: (r.options ?? [])
            .map((o) => ({ v: String(o.v), m: num(o.m), q: num(o.q) }))
            .sort((a, b) => a.v.localeCompare(b.v) || (a.m ?? 0) - (b.m ?? 0)),
    }))

    lines.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    return JSON.stringify(lines)
}
