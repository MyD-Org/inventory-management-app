import { sql } from "@/lib/database"

// Estados internos del tablero del taller y su traducción para el cliente.
// El pedido guarda SIEMPRE el estado interno; GET /api/pedidos agrega
// customer_status derivado de acá, para que el bot no repita la jerga interna.
export const ORDER_STATUSES = ["recibido", "en_produccion", "listo", "entregado", "cancelado"] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

const CUSTOMER_STATUS: Record<OrderStatus, string> = {
    recibido: "Recibido",
    en_produccion: "En fabricación",
    listo: "Listo para retirar",
    entregado: "Entregado",
    cancelado: "Cancelado",
}

export function customerStatus(status: string): string {
    return CUSTOMER_STATUS[status as OrderStatus] ?? status
}

export interface SpecField {
    label: string
    options: string[]
}

// Vocabulario vigente: { clamp: { label: "Grampa", options: ["larga", "corta"] } }.
// Solo campos y opciones activas — desactivar una opción la saca del vocabulario
// sin borrar los pedidos históricos que la usaron.
export async function getSpecs(): Promise<Record<string, SpecField>> {
    const rows = await sql`
        SELECT f.key, f.label, o.value
        FROM spec_fields f
        LEFT JOIN spec_options o ON o.field_key = f.key AND o.active = TRUE
        WHERE f.active = TRUE
        ORDER BY f.position ASC, f.key ASC, o.position ASC, o.value ASC
    `
    const specs: Record<string, SpecField> = {}
    for (const r of rows as any[]) {
        if (!specs[r.key]) specs[r.key] = { label: r.label, options: [] }
        if (r.value) specs[r.key].options.push(r.value)
    }
    return specs
}

// Valida las specs de una línea contra el vocabulario. Devuelve los errores
// como texto legible (los consume el 400 del POST, y los lee una persona).
export function validateSpecs(specs: Record<string, unknown>, vocab: Record<string, SpecField>): string[] {
    const errors: string[] = []
    for (const [key, value] of Object.entries(specs)) {
        const field = vocab[key]
        if (!field) {
            errors.push(`Campo de spec desconocido: "${key}". Válidos: ${Object.keys(vocab).join(", ")}`)
            continue
        }
        if (!field.options.includes(String(value))) {
            errors.push(`Valor inválido para "${key}": "${value}". Válidos: ${field.options.join(", ")}`)
        }
    }
    return errors
}

export interface ResolvedProduct {
    budgetId: number
    label: string
    unitPrice: number
}

// Busca la hoja de costo del producto: primero nombre exacto (case-insensitive),
// como hacen /api/budgets/find y el editor de cotizaciones; si no, ILIKE parcial
// y solo acepta el resultado si es UNO (ambiguo = mejor que lo revise el taller).
// unit_price = costo × (1 + margen), el mismo cálculo de lib/costed-products.ts.
export async function resolveProduct(name: string): Promise<ResolvedProduct | null> {
    const like = `%${name}%`
    const rows = await sql`
        SELECT
            b.id, b.name, b.margin_pct,
            COALESCE(m.total, 0) + COALESCE(l.total, 0) + COALESCE(e.total, 0) AS cost,
            (lower(b.name) = lower(${name})) AS exact
        FROM budgets b
        LEFT JOIN (SELECT budget_id, SUM(qty * unit_cost) AS total FROM budget_materials GROUP BY budget_id) m ON m.budget_id = b.id
        LEFT JOIN (SELECT budget_id, SUM(hours * hourly_rate) AS total FROM budget_labor GROUP BY budget_id) l ON l.budget_id = b.id
        LEFT JOIN (SELECT budget_id, SUM(amount) AS total FROM budget_extras GROUP BY budget_id) e ON e.budget_id = b.id
        WHERE lower(b.name) = lower(${name}) OR b.name ILIKE ${like}
        ORDER BY exact DESC, b.id DESC
    `
    if (rows.length === 0) return null
    const exactMatches = (rows as any[]).filter((r) => r.exact)
    // Sin match exacto y varios parciales: es ambiguo, no adivinamos.
    if (exactMatches.length === 0 && rows.length > 1) return null

    const r = (exactMatches[0] ?? rows[0]) as any
    const cost = Number(r.cost)
    const marginPct = Number(r.margin_pct)
    return {
        budgetId: r.id,
        label: r.name,
        unitPrice: Math.round(cost * (1 + marginPct / 100)),
    }
}
