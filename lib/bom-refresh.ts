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
//   - cerrado: retirado o cancelado. El BOM es historia.
//   - listo: listo para retirar. El equipo está armado y esperando al cliente:
//     la lista ya cumplió su función, no hay nada para ir a revisar.
//   - en_entrega: 'preparando entrega', la etapa administrativa (factura,
//     remito). El equipo ya está fabricado pero el pedido sigue en movimiento,
//     así que se avisa.
//
// Haber descontado stock NO frena nada, y es a propósito: el descuento se hace
// material por material y un pedido grande convive días con la mitad retirada y
// la mitad no. Frenar el pedido entero por un solo movimiento dejaba sin
// corregir las líneas que nadie fue a buscar todavía, que son justo las que
// importan. materialNeeds() ya compara, material por material, lo que pide la
// lista contra lo que realmente salió del depósito (neto de devoluciones), así
// que subir una cantidad ya descontada deja la línea en "descontado en parte" y
// el taller va por la diferencia.
//
// Lo que el recálculo NO puede arreglar es lo que ya salió de más: si la ficha
// BAJA una cantidad que el taller ya retiró, el excedente queda afuera del
// depósito sin que la pantalla lo muestre. Por eso el pedido con descuentos se
// rehace igual pero se reporta, para que alguien lo mire.
export type BomRefreshSkipReason = "cerrado" | "listo" | "en_entrega"

// De los motivos de arriba, los que hay que contarle a quien guardó la ficha
// porque hay algo para hacer a mano. Los otros se saltean en silencio: avisar de
// un pedido que ya está armado o entregado es ruido, no información.
export const REPORTABLE_SKIPS = ["en_entrega"] as const
export type ReportableSkip = (typeof REPORTABLE_SKIPS)[number]

export function isReportableSkip(reason: BomRefreshSkipReason): reason is ReportableSkip {
    return (REPORTABLE_SKIPS as readonly string[]).includes(reason)
}

export interface BomRefreshDecision {
    refresh: boolean
    skip: BomRefreshSkipReason | null
    /**
     * Se rehace, pero el pedido ya tenía material retirado del depósito: hay que
     * mirar que lo descontado siga teniendo sentido con la lista nueva.
     */
    checkConsumption: boolean
}

// El orden de las reglas importa: los estados en los que no hay nada para hacer
// van PRIMERO, así un pedido ya armado o entregado no pide una revisión que no
// tiene sentido por haber descontado stock.
export function bomRefreshDecision(order: { status: string; consumed: boolean }): BomRefreshDecision {
    const no = (skip: BomRefreshSkipReason): BomRefreshDecision => ({ refresh: false, skip, checkConsumption: false })

    if (order.status === "retirado" || order.status === "cancelado") return no("cerrado")
    if (order.status === "listo_para_retirar") return no("listo")
    if (!(BOM_REFRESHABLE_STATUSES as string[]).includes(order.status)) return no("en_entrega")

    return { refresh: true, skip: null, checkConsumption: order.consumed }
}

export interface BomRefreshOrder {
    orderId: number
    /** Cómo lo nombra el taller: la referencia si la tiene, si no el id externo. */
    label: string
}

export interface BomRefreshReport {
    updated: BomRefreshOrder[]
    /** Subconjunto de `updated`: los que además ya tenían material retirado. */
    checkConsumption: BomRefreshOrder[]
    /** No se rehicieron y hay algo para mirar: ver REPORTABLE_SKIPS. */
    pending: Array<BomRefreshOrder & { reason: ReportableSkip }>
}

const REASON_TEXT: Record<ReportableSkip, string> = {
    en_entrega: "están preparando la entrega",
}

// El aviso que ve quien guardó la ficha. null = no hay nada que contar (ningún
// pedido en marcha usaba este producto).
export function bomRefreshMessage(report: BomRefreshReport): { title: string; description?: string } | null {
    const { updated, checkConsumption, pending } = report
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

    // Los que ya tenían material afuera del depósito: lo que falta se recalcula
    // solo, pero lo que se retiró de más no lo muestra ninguna pantalla.
    if (checkConsumption.length > 0) {
        partes.push(
            `${list(checkConsumption)} ${checkConsumption.length === 1 ? "ya había descontado" : "ya habían descontado"} stock: revisá que lo que ya salió del depósito siga coincidiendo.`,
        )
    }

    // Los que no se tocaron se agrupan por motivo: el taller necesita saber cuál
    // mirar a mano y por qué, no una lista suelta de números de pedido.
    for (const reason of REPORTABLE_SKIPS) {
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
    /** `checkConsumption` viaja con cada pedido: se rehace igual, pero hay que mirarlo. */
    refresh: Array<BomRefreshOrder & { checkConsumption: boolean }>
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
            plan.refresh.push({ ...orden, checkConsumption: decision.checkConsumption })
            continue
        }
        // Un pedido entregado o ya armado no se reporta: su lista es historia,
        // no algo pendiente de revisar.
        if (decision.skip && isReportableSkip(decision.skip)) {
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

// ---------- ¿La lista del pedido quedó vieja? ----------

// Una línea de la lista del pedido (order_item_materials), o la que saldría hoy
// de la receta. Los numeric llegan como string desde el driver, de ahí la unión.
export interface OrderBomLine {
    materialId: number | string | null
    label: string
    qtyPerUnit: number | string
    qtyTotal: number | string
    familyId?: number | string | null
    specValue?: string | null
}

// Huella de la lista de materiales de UN pedido. Sirve para comparar lo que el
// pedido tiene guardado contra lo que la receta daría hoy, al abrirlo.
//
// Compara por CONTENIDO y no por ids de fila: el BOM se reescribe entero en cada
// re-explosión, así que los ids son nuevos siempre. Tampoco por orden, que
// depende de cómo se insertó. Las cantidades se normalizan a número porque el
// driver devuelve numeric como string ("2.0000" es 2).
export function orderBomFingerprint(lines: OrderBomLine[]): string {
    const norm = lines.map((l) => ({
        m: l.materialId === null || l.materialId === undefined ? null : Number(l.materialId),
        l: l.label?.trim() ?? "",
        q: Number(l.qtyPerUnit),
        t: Number(l.qtyTotal),
        f: l.familyId === null || l.familyId === undefined ? null : Number(l.familyId),
        v: l.specValue ?? null,
    }))
    norm.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    return JSON.stringify(norm)
}

// ¿Lo que el pedido tiene guardado es lo mismo que daría la receta de hoy?
//
// Incluye los valores sin mapear: que aparezca —o desaparezca— un "no existe la
// variante de X" es un cambio que el taller tiene que ver, aunque los materiales
// resultantes sean los mismos.
export function sameOrderBom(
    guardado: { lines: OrderBomLine[]; unmapped: string[] },
    receta: { lines: OrderBomLine[]; unmapped: string[] },
): boolean {
    const mismoUnmapped =
        JSON.stringify([...(guardado.unmapped ?? [])].sort()) === JSON.stringify([...(receta.unmapped ?? [])].sort())
    return mismoUnmapped && orderBomFingerprint(guardado.lines) === orderBomFingerprint(receta.lines)
}
