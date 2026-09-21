import { pendingQuantity, round2 } from "@/lib/deliveries"
import type { OrderStatus } from "@/lib/order-statuses"
import type { SpecField, SpecKind } from "@/lib/order-validation"

// Producción por producto: las líneas de TODOS los pedidos en fabricación, juntas
// por producto, para que el taller vea cuánto hay que armar de cada variante sin
// abrir pedido por pedido.
//
// Lógica pura, sin importar la base: la consulta vive en lib/production.ts y el
// vocabulario se inyecta. Así se testea sin Postgres y un client component puede
// importar los tipos sin arrastrar lib/database.ts.

// Estados que la vista de producción puede mostrar. Son columnas del tablero: un
// pedido entra y sale de esta vista cuando alguien mueve su tarjeta.
//   recibido / en_proceso → lo que el taller tiene que armar (van por defecto)
//   por_revisar           → todavía sin confirmar; opcional, para ver lo que viene
// De 'por_facturar' en adelante el pedido ya está fabricado.
export const PRODUCTION_STATUSES = ["por_revisar", "recibido", "en_proceso"] as const satisfies readonly OrderStatus[]
export const DEFAULT_PRODUCTION_STATUSES: OrderStatus[] = ["recibido", "en_proceso"]

/** Lee `?estados=recibido,en_proceso`. Vacío o inválido = los de por defecto. */
export function parseProductionStatuses(raw: string | undefined): OrderStatus[] {
    const pedidos = (raw ?? "").split(",").filter((s): s is (typeof PRODUCTION_STATUSES)[number] =>
        (PRODUCTION_STATUSES as readonly string[]).includes(s),
    )
    return pedidos.length ? PRODUCTION_STATUSES.filter((s) => pedidos.includes(s)) : DEFAULT_PRODUCTION_STATUSES
}

/** Una línea de pedido tal como sale de la base. */
export interface ProductionLine {
    order_id: number
    order_number: number
    customer_name: string | null
    status: string
    delivery_date_estimate: string | null
    budget_id: number | null
    product: string
    specs: Record<string, string>
    quantity: number
    /** Lo ya remitido. Lo que cuenta la vista es quantity - delivered. */
    delivered: number
}

/** Una columna de la tabla: las mismas, y en el mismo orden, que las de un pedido. */
export interface ProductionField {
    key: string
    label: string
    kind: SpecKind
}

export interface ProductionCombo {
    /** Un nombre de opción por campo, en el mismo orden que `fields`. */
    values: string[]
    units: number
    /** De qué pedidos sale esta combinación, la entrega más próxima primero. */
    lines: ProductionOrderLine[]
}

export interface ProductionOrderLine {
    order_id: number
    order_number: number
    customer_name: string | null
    status: string
    delivery_date_estimate: string | null
    /** En el mismo orden que `fields` del grupo. */
    values: string[]
    units: number
}

export interface ProductionGroup {
    /** Estable entre renders: la ficha, o el nombre si la línea no tiene ficha. */
    key: string
    /**
     * null = producto sin hoja de costo. Se agrupa igual, por nombre: que falte la
     * ficha es un problema de la oficina (no hay receta ni descuento de stock), no
     * un motivo para esconderle al taller cuántas estacas tiene que cortar.
     */
    budget_id: number | null
    product: string
    units: number
    /** Pedidos distintos que piden este producto. */
    orders: number
    /** La entrega más próxima entre sus pedidos. null = ninguno tiene fecha. */
    nextDelivery: string | null
    fields: ProductionField[]
    combos: ProductionCombo[]
    lines: ProductionOrderLine[]
}

export interface ProductionSummary {
    groups: ProductionGroup[]
    units: number
    orders: number
}

export const SIN_ESPECIFICAR = "Sin especificar"

// Las fechas son 'YYYY-MM-DD': comparan bien como texto. Sin fecha, al final.
function byDelivery(a: string | null, b: string | null): number {
    if (a === b) return 0
    if (a === null) return 1
    if (b === null) return -1
    return a < b ? -1 : 1
}

function optionOf(field: SpecField, raw: string | undefined): { value: string; label: string } {
    if (field.kind === "boolean") {
        // No marcar es una respuesta válida (el "no"), igual que en la validación.
        const value = raw === "con" ? "con" : "sin"
        const nombre = field.label.toLowerCase()
        return { value, label: field.labels[value] ?? `${value === "con" ? "Con" : "Sin"} ${nombre}` }
    }
    // El texto libre ("10 metros de cable") también separa combinaciones: un equipo
    // con esa indicación no se arma igual que uno sin ella.
    if (field.kind === "text") {
        const texto = raw?.trim() ?? ""
        return { value: texto.toLowerCase(), label: texto || SIN_ESPECIFICAR }
    }
    if (!raw) return { value: "", label: SIN_ESPECIFICAR }
    // Una opción desactivada conserva su label en el vocabulario; una que ya no
    // existe se muestra cruda antes que esconder lo que el cliente pidió.
    return { value: raw, label: field.labels[raw] ?? raw }
}

function toOrderLine(l: ProductionLine, units: number, values: string[]): ProductionOrderLine {
    return {
        order_id: l.order_id,
        order_number: l.order_number,
        customer_name: l.customer_name,
        status: l.status,
        delivery_date_estimate: l.delivery_date_estimate,
        values,
        units,
    }
}

function sortLines(lines: ProductionOrderLine[]): ProductionOrderLine[] {
    return lines.sort(
        (a, b) => byDelivery(a.delivery_date_estimate, b.delivery_date_estimate) || a.order_number - b.order_number,
    )
}

function buildGroup(key: string, lines: Array<{ line: ProductionLine; units: number }>, vocab: Record<string, SpecField>): ProductionGroup {
    // TODOS los campos del vocabulario, usados o no: la tabla tiene que leerse
    // igual que la de un pedido, con las mismas columnas en el mismo lugar.
    const campos = Object.entries(vocab)

    const combos = new Map<string, ProductionCombo>()
    const orderLines: ProductionOrderLine[] = []

    for (const { line, units } of lines) {
        const elegidas = campos.map(([key, field]) => optionOf(field, line.specs[key]))

        const orderLine = toOrderLine(line, units, elegidas.map((o) => o.label))
        orderLines.push(orderLine)

        const comboKey = JSON.stringify(elegidas.map((o) => o.value))
        const combo = combos.get(comboKey)
        if (combo) {
            combo.units = round2(combo.units + units)
            combo.lines.push(orderLine)
        } else {
            combos.set(comboKey, { values: orderLine.values, units, lines: [orderLine] })
        }
    }

    const masPedidoPrimero = (a: { units: number }, b: { units: number }) => b.units - a.units

    return {
        key,
        budget_id: lines[0].line.budget_id,
        // Todas las líneas del grupo comparten ficha o nombre: cualquiera sirve.
        product: lines[0].line.product,
        units: round2(lines.reduce((s, l) => s + l.units, 0)),
        orders: new Set(lines.map(({ line }) => line.order_id)).size,
        nextDelivery: lines.map(({ line }) => line.delivery_date_estimate).sort(byDelivery)[0] ?? null,
        fields: campos.map(([key, field]) => ({ key, label: field.label, kind: field.kind })),
        combos: [...combos.values()]
            .map((c) => ({ ...c, lines: sortLines([...c.lines]) }))
            .sort(masPedidoPrimero),
        lines: sortLines(orderLines),
    }
}

// Sin ficha se agrupa por nombre. Los nombres salen de un selector, así que
// coinciden; igual se pliegan mayúsculas y espacios por las líneas que cargó el bot.
function groupKey(line: ProductionLine): string {
    if (line.budget_id !== null) return `ficha:${line.budget_id}`
    return `nombre:${line.product.trim().toLowerCase().replace(/\s+/g, " ")}`
}

export function summarizeProduction(lines: ProductionLine[], vocab: Record<string, SpecField>): ProductionSummary {
    const porProducto = new Map<string, Array<{ line: ProductionLine; units: number }>>()
    const pedidos = new Set<number>()
    let total = 0

    for (const line of lines) {
        const units = pendingQuantity({ id: 0, product: line.product, quantity: line.quantity, delivered: line.delivered })
        // Remitida entera: ya salió del taller, no hay nada que armar.
        if (units <= 0) continue

        total = round2(total + units)
        pedidos.add(line.order_id)

        const key = groupKey(line)
        const grupo = porProducto.get(key)
        if (grupo) grupo.push({ line, units })
        else porProducto.set(key, [{ line, units }])
    }

    const groups = [...porProducto.entries()]
        .map(([key, ls]) => buildGroup(key, ls, vocab))
        .sort((a, b) => byDelivery(a.nextDelivery, b.nextDelivery) || b.units - a.units)

    return { groups, units: total, orders: pedidos.size }
}
