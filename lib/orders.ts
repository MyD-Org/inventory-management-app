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

export interface OrderItemPayload {
    product: string
    qty: number
    specs?: Record<string, unknown>
}

export interface OrderPayload {
    external_id: string
    customer_external_id: string
    customer_name?: string | null
    source_conversation?: string | null
    notes?: string | null
    items: OrderItemPayload[]
}

export interface OrderMaterial {
    material_id: number | null
    label: string
    qty_per_unit: number
    qty_total: number
    unit_cost: number
}

export interface OrderItem {
    id: number
    line_no: number
    budget_id: number | null
    label: string
    specs: Record<string, string>
    qty: number
    unit_price: number
    needs_review: boolean
    materials: OrderMaterial[]
}

export interface Order {
    id: number
    external_id: string
    customer_external_id: string
    customer_name: string | null
    status: OrderStatus
    customer_status: string
    source_conversation: string | null
    notes: string | null
    created_at: string
    updated_at: string
    items: OrderItem[]
}

// Devuelve el pedido completo con sus líneas y el BOM de cada una.
export async function readOrder(orderId: number): Promise<Order | null> {
    const [order] = await sql`
        SELECT id, external_id, customer_external_id, customer_name, status,
               source_conversation, notes, created_at, updated_at
        FROM orders WHERE id = ${orderId}
    `
    if (!order) return null

    const items = await sql`
        SELECT id, line_no, budget_id, label, specs, qty, unit_price, needs_review
        FROM order_items WHERE order_id = ${orderId} ORDER BY line_no ASC
    `
    const itemIds = (items as any[]).map((i) => i.id)
    const materials = itemIds.length
        ? await sql`
            SELECT order_item_id, material_id, label, qty_per_unit, qty_total, unit_cost
            FROM order_item_materials
            WHERE order_item_id = ANY(${itemIds})
            ORDER BY id ASC
        `
        : []

    return {
        ...(order as any),
        customer_status: customerStatus(order.status),
        items: (items as any[]).map((i) => ({
            ...i,
            qty: Number(i.qty),
            unit_price: Number(i.unit_price),
            materials: (materials as any[])
                .filter((m) => m.order_item_id === i.id)
                .map(({ order_item_id, ...m }) => ({
                    ...m,
                    qty_per_unit: Number(m.qty_per_unit),
                    qty_total: Number(m.qty_total),
                    unit_cost: Number(m.unit_cost),
                })),
        })),
    } as Order
}

// Valida el payload contra el vocabulario vigente. Devuelve los errores como
// texto legible: los lee una persona (en la vista) o el bot (en el 400 del POST).
export async function validateOrderPayload(payload: OrderPayload): Promise<string[]> {
    const errors: string[] = []
    if (!payload.external_id?.trim()) errors.push("Falta external_id")
    if (!payload.customer_external_id?.trim()) errors.push("Falta customer_external_id")
    if (!payload.items || payload.items.length === 0) errors.push("El pedido no tiene items")
    if (errors.length > 0) return errors

    const vocab = await getSpecs()
    payload.items.forEach((item, idx) => {
        if (!String(item?.product ?? "").trim()) errors.push(`Item ${idx + 1}: falta el producto`)
        const qty = Number(item?.qty ?? 1)
        if (!Number.isFinite(qty) || qty <= 0) errors.push(`Item ${idx + 1}: cantidad inválida`)
        for (const e of validateSpecs(item?.specs ?? {}, vocab)) errors.push(`Item ${idx + 1}: ${e}`)
    })
    return errors
}

// Crea el pedido y explota el BOM de cada línea desde la hoja de costo.
// IDEMPOTENTE: si el external_id ya existe no escribe nada y devuelve el pedido
// original con created = false. La usan el POST de la API y la vista manual, para
// que las dos rutas se comporten igual.
export async function createOrder(payload: OrderPayload) {
    const inserted = await sql`
        INSERT INTO orders (external_id, customer_external_id, customer_name, source_conversation, notes)
        VALUES (
            ${payload.external_id.trim()},
            ${payload.customer_external_id.trim()},
            ${payload.customer_name ?? null},
            ${payload.source_conversation ?? null},
            ${payload.notes ?? null}
        )
        ON CONFLICT (external_id) DO NOTHING
        RETURNING id
    `
    if (inserted.length === 0) {
        const [existing] = await sql`SELECT id FROM orders WHERE external_id = ${payload.external_id.trim()}`
        return { created: false, order: await readOrder(existing.id) }
    }

    const orderId = inserted[0].id as number

    try {
        for (const [idx, item] of payload.items.entries()) {
            const productName = String(item.product).trim()
            const qty = Number(item.qty ?? 1)
            const resolved = await resolveProduct(productName)

            const [line] = await sql`
                INSERT INTO order_items (order_id, line_no, budget_id, label, specs, qty, unit_price, needs_review)
                VALUES (
                    ${orderId}, ${idx + 1}, ${resolved?.budgetId ?? null},
                    ${resolved?.label ?? productName},
                    ${JSON.stringify(item.specs ?? {})}::jsonb,
                    ${qty}, ${resolved?.unitPrice ?? 0}, ${resolved === null}
                )
                RETURNING id
            `

            // BOM: copia congelada de la receta. Si el producto no matcheó, la
            // línea queda sin BOM y marcada needs_review para el taller.
            if (resolved) {
                await sql`
                    INSERT INTO order_item_materials (order_item_id, material_id, label, qty_per_unit, qty_total, unit_cost)
                    SELECT ${line.id}, bm.material_id, bm.label, bm.qty, bm.qty * ${qty}, bm.unit_cost
                    FROM budget_materials bm
                    WHERE bm.budget_id = ${resolved.budgetId}
                    ORDER BY bm.id ASC
                `
            }
        }
    } catch (error) {
        // El driver HTTP de neon no da transacciones interactivas: si falla a mitad
        // borramos el pedido (las líneas caen por CASCADE). Sin esto quedaría un
        // pedido incompleto que el external_id impide recrear.
        await sql`DELETE FROM orders WHERE id = ${orderId}`
        throw error
    }

    return { created: true, order: await readOrder(orderId) }
}
