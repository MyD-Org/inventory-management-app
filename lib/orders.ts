import { sql } from "@/lib/database"
import { customerStatus as toCustomerStatus, ORDER_PRIORITIES as PRIORITIES, type OrderStatus as Status } from "@/lib/order-statuses"

// Módulo de pedidos. El contrato de los endpoints sigue docs/pedidos-avantec.md
// del CRM: nombres de campo, forma del payload y estados salen de ahí.
//
// SIN PLATA: el doc es explícito ("por este canal no se habla de plata"). Ni el
// payload del bot ni el pedido guardado tienen precios. La facturación va por
// Alegra; acá 'facturado' es solo una columna del tablero.

// Los estados viven en lib/order-statuses.ts (sin importaciones de servidor)
// para que los client components puedan usarlos sin arrastrar lib/database.ts
// al bundle del navegador. Se reexportan acá por comodidad del lado servidor.
export {
    ORDER_STATUSES,
    BOARD_STATUSES,
    STATUS_LABELS,
    ORDER_PRIORITIES,
    customerStatus,
    type OrderStatus,
} from "@/lib/order-statuses"

// Mapa estado interno -> texto al cliente, configurable desde /pedidos/opciones.
// Si la clave no está configurada cae al default de lib/order-statuses.ts.
export async function getCustomerStatusMap(): Promise<Record<string, string>> {
    try {
        const [row] = await sql`SELECT value FROM app_settings WHERE key = 'order_customer_status'`
        return (row?.value as Record<string, string>) ?? {}
    } catch {
        return {}
    }
}

export type SpecKind = "list" | "text" | "boolean"

export interface SpecField {
    label: string
    options: string[]
    free_text: boolean
    // 'list' lista cerrada · 'text' texto libre · 'boolean' sí/no con un tilde.
    // En 'boolean' NO marcar es una respuesta válida (el "no"), no un dato que
    // falte confirmar: por eso no entra en el conteo de faltantes.
    kind: SpecKind
    // Cómo se muestra cada opción ("calido" -> "Cálido", "8" -> "8°"). Es solo
    // para la UI: GET /api/specs sigue devolviendo options tal cual manda el doc
    // del CRM, porque esos son los valores del contrato con el bot.
    labels: Record<string, string>
}

// Vocabulario vigente: { clamp: { label: "Grampa", options: ["larga","corta"] } }.
// Solo campos y opciones activas — desactivar una opción la saca del vocabulario
// sin romper los pedidos históricos que la usaron.
export async function getSpecs(): Promise<Record<string, SpecField>> {
    const rows = await sql`
        SELECT f.key, f.label, f.free_text, f.kind, o.value, o.label AS option_label
        FROM spec_fields f
        LEFT JOIN spec_options o ON o.field_key = f.key AND o.active = TRUE
        WHERE f.active = TRUE
        ORDER BY f.position ASC, f.key ASC, o.position ASC, o.value ASC
    `
    const specs: Record<string, SpecField> = {}
    for (const r of rows as any[]) {
        if (!specs[r.key]) {
            specs[r.key] = {
                label: r.label,
                options: [],
                free_text: r.free_text,
                kind: (r.kind ?? (r.free_text ? "text" : "list")) as SpecKind,
                labels: {},
            }
        }
        if (r.value) {
            specs[r.key].options.push(r.value)
            specs[r.key].labels[r.value] = r.option_label ?? r.value
        }
    }
    return specs
}

// Valida las specs de una línea contra el vocabulario. Los campos free_text
// (como 'other') aceptan cualquier cosa. Errores en texto legible: los lee una
// persona en la vista, o el bot en el 400 del POST.
export function validateSpecs(specs: Record<string, unknown>, vocab: Record<string, SpecField>): string[] {
    const errors: string[] = []
    for (const [key, value] of Object.entries(specs)) {
        const field = vocab[key]
        if (!field) {
            errors.push(`Campo de spec desconocido: "${key}". Válidos: ${Object.keys(vocab).join(", ")}`)
            continue
        }
        if (field.kind === "text") continue
        // Vacío = no especificado, no es un error.
        if (value === "" || value === null || value === undefined) continue
        if (field.kind === "boolean") {
            if (String(value) !== "con" && String(value) !== "sin") {
                errors.push(`Valor inválido para "${key}": "${value}". Válidos: con, sin`)
            }
            continue
        }
        if (!field.options.includes(String(value))) {
            errors.push(`Valor inválido para "${key}": "${value}". Válidos: ${field.options.join(", ")}`)
        }
    }
    return errors
}

interface ResolvedProduct {
    budgetId: number
    label: string
}

// Busca la hoja de costo del producto: primero nombre exacto (case-insensitive),
// como /api/budgets/find; si no, ILIKE parcial y solo si el resultado es UNO
// (ambiguo = mejor que lo revise el taller que adivinar).
export async function resolveProduct(name: string): Promise<ResolvedProduct | null> {
    const like = `%${name}%`
    const rows = await sql`
        SELECT id, name, (lower(name) = lower(${name})) AS exact
        FROM budgets
        WHERE lower(name) = lower(${name}) OR name ILIKE ${like}
        ORDER BY exact DESC, id DESC
    `
    if (rows.length === 0) return null
    const exactMatches = (rows as any[]).filter((r) => r.exact)
    if (exactMatches.length === 0 && rows.length > 1) return null

    const r = (exactMatches[0] ?? rows[0]) as any
    return { budgetId: r.id, label: r.name }
}

// ---------- Lectura ----------

export interface OrderMaterial {
    material_id: number | null
    label: string
    qty_per_unit: number
    qty_total: number
}

export interface OrderItem {
    id: number
    line_no: number
    budget_id: number | null
    product: string
    product_external_id: string | null
    specs: Record<string, string>
    quantity: number
    needs_review: boolean
    materials: OrderMaterial[]
}

export interface MissingMaterial {
    material_id: number | null
    label: string
    required: number
    available: number
    missing: number
}

export interface Order {
    id: number
    order_number: number
    external_id: string
    origin: string
    customer_external_id: string
    customer_name: string | null
    customer_phone: string | null
    status: Status
    customer_status: string
    priority: string
    delivery_date_estimate: string | null
    source_conversation: string | null
    notes: string | null
    created_at: string
    updated_at: string
    items: OrderItem[]
}

export async function readOrder(orderId: number): Promise<Order | null> {
    const overrides = await getCustomerStatusMap()
    const [order] = await sql`
        SELECT id, order_number, external_id, origin, customer_external_id, customer_name,
               customer_phone, status, priority,
               -- ::text para no arrastrar corrimiento de zona: es una fecha, no un instante
               delivery_date_estimate::text AS delivery_date_estimate,
               source_conversation, notes, created_at, updated_at
        FROM orders WHERE id = ${orderId}
    `
    if (!order) return null

    const items = await sql`
        SELECT id, line_no, budget_id, product, product_external_id, specs, quantity, needs_review
        FROM order_items WHERE order_id = ${orderId} ORDER BY line_no ASC
    `
    const itemIds = (items as any[]).map((i) => i.id)
    const materials = itemIds.length
        ? await sql`
            SELECT order_item_id, material_id, label, qty_per_unit, qty_total
            FROM order_item_materials
            WHERE order_item_id = ANY(${itemIds})
            ORDER BY id ASC
        `
        : []

    return {
        ...(order as any),
        customer_status: toCustomerStatus(order.status, overrides),
        items: (items as any[]).map((i) => ({
            ...i,
            quantity: Number(i.quantity),
            materials: (materials as any[])
                .filter((m) => m.order_item_id === i.id)
                .map(({ order_item_id, ...m }) => ({
                    ...m,
                    qty_per_unit: Number(m.qty_per_unit),
                    qty_total: Number(m.qty_total),
                })),
        })),
    } as Order
}

// Materiales del pedido que NO alcanzan con el stock actual. Va en la respuesta
// del POST (missing_materials, según el doc) para que el bot pueda avisar, y lo
// muestra el detalle del pedido para que el taller sepa qué reponer.
// Suma lo requerido por material a través de todas las líneas del pedido.
export async function missingMaterials(orderId: number): Promise<MissingMaterial[]> {
    const rows = await sql`
        SELECT
            oim.material_id,
            MIN(oim.label) AS label,
            SUM(oim.qty_total) AS required,
            COALESCE(MIN(i.available_stock), 0) AS available
        FROM order_item_materials oim
        JOIN order_items oi ON oi.id = oim.order_item_id
        LEFT JOIN inventory i ON i.material_id = oim.material_id
        WHERE oi.order_id = ${orderId} AND oim.material_id IS NOT NULL
        GROUP BY oim.material_id
        HAVING SUM(oim.qty_total) > COALESCE(MIN(i.available_stock), 0)
        ORDER BY MIN(oim.label) ASC
    `
    return (rows as any[]).map((r) => ({
        material_id: r.material_id,
        label: r.label,
        required: Number(r.required),
        available: Number(r.available),
        missing: Number(r.required) - Number(r.available),
    }))
}

// ---------- Escritura ----------

export interface OrderItemPayload {
    product: string
    product_external_id?: string | null
    quantity: number
    specs?: Record<string, unknown>
}

export interface OrderPayload {
    external_id: string
    origin?: string
    customer: {
        external_id: string
        name?: string | null
        phone?: string | null
    }
    items: OrderItemPayload[]
    delivery_date_estimate?: string | null
    priority?: string
    notes?: string | null
    source_conversation?: string | null
}

export async function validateOrderPayload(payload: OrderPayload): Promise<string[]> {
    const errors: string[] = []
    if (!payload.external_id?.trim()) errors.push("Falta external_id")
    if (!payload.customer?.external_id?.trim()) errors.push("Falta customer.external_id")
    if (!payload.items || payload.items.length === 0) errors.push("El pedido no tiene items")
    if (payload.priority && !PRIORITIES.includes(payload.priority as any)) {
        errors.push(`priority inválida: "${payload.priority}". Válidas: ${PRIORITIES.join(", ")}`)
    }
    if (errors.length > 0) return errors

    const vocab = await getSpecs()
    payload.items.forEach((item, idx) => {
        if (!String(item?.product ?? "").trim()) errors.push(`Item ${idx + 1}: falta product`)
        const qty = Number(item?.quantity ?? 1)
        if (!Number.isFinite(qty) || qty <= 0) errors.push(`Item ${idx + 1}: quantity inválida`)
        for (const e of validateSpecs(item?.specs ?? {}, vocab)) errors.push(`Item ${idx + 1}: ${e}`)
    })
    return errors
}

// Crea el pedido y explota el BOM de cada línea desde la hoja de costo.
// IDEMPOTENTE: si el external_id ya existe no escribe nada y devuelve el pedido
// original con created = false. La usan el POST de la API y la vista manual, así
// las dos rutas se comportan igual.
export async function createOrder(payload: OrderPayload) {
    const externalId = payload.external_id.trim()

    // Los pedidos del bot pasan por revisión humana antes de entrar al flujo (lo
    // sugiere el doc del CRM). Los cargados a mano ya los revisó quien los tipeó.
    const origin = payload.origin?.trim() || "manual"
    const initialStatus = origin === "manual" ? "recibido" : "por_revisar"

    const inserted = await sql`
        INSERT INTO orders (
            external_id, origin, customer_external_id, customer_name, customer_phone,
            status, priority, delivery_date_estimate, source_conversation, notes
        )
        VALUES (
            ${externalId},
            ${origin},
            ${payload.customer.external_id.trim()},
            ${payload.customer.name ?? null},
            ${payload.customer.phone ?? null},
            ${initialStatus},
            ${payload.priority || "normal"},
            ${payload.delivery_date_estimate || null},
            ${payload.source_conversation ?? null},
            ${payload.notes ?? null}
        )
        ON CONFLICT (external_id) DO NOTHING
        RETURNING id
    `
    if (inserted.length === 0) {
        const [existing] = await sql`SELECT id FROM orders WHERE external_id = ${externalId}`
        return { created: false, order: await readOrder(existing.id) }
    }

    const orderId = inserted[0].id as number

    try {
        for (const [idx, item] of payload.items.entries()) {
            const productName = String(item.product).trim()
            const quantity = Number(item.quantity ?? 1)
            const resolved = await resolveProduct(productName)

            const [line] = await sql`
                INSERT INTO order_items (
                    order_id, line_no, budget_id, product, product_external_id,
                    specs, quantity, needs_review
                )
                VALUES (
                    ${orderId}, ${idx + 1}, ${resolved?.budgetId ?? null},
                    ${resolved?.label ?? productName},
                    ${item.product_external_id ?? null},
                    ${JSON.stringify(item.specs ?? {})}::jsonb,
                    ${quantity}, ${resolved === null}
                )
                RETURNING id
            `

            // BOM: copia congelada de la receta. Si el producto no matcheó, la
            // línea queda sin BOM y marcada needs_review para el taller.
            if (resolved) {
                await sql`
                    INSERT INTO order_item_materials (order_item_id, material_id, label, qty_per_unit, qty_total)
                    SELECT ${line.id}, bm.material_id, bm.label, bm.qty, bm.qty * ${quantity}
                    FROM budget_materials bm
                    WHERE bm.budget_id = ${resolved.budgetId}
                    ORDER BY bm.id ASC
                `
            }
        }
    } catch (error) {
        // El driver HTTP de neon no da transacciones interactivas: si falla a
        // mitad borramos el pedido (las líneas caen por CASCADE). Sin esto
        // quedaría un pedido incompleto que el external_id impide recrear.
        await sql`DELETE FROM orders WHERE id = ${orderId}`
        throw error
    }

    return { created: true, order: await readOrder(orderId) }
}

// ---------- Consumo de materiales ----------

export interface MaterialNeed {
    material_id: number | null
    label: string
    /** Lo que pide el pedido, sumando todas sus líneas. */
    required: number
    /** Lo que ya se descontó del inventario para este pedido. */
    consumed: number
    /** Lo que todavía falta descontar. */
    pending: number
    /** Stock disponible hoy. null si el material no está en el inventario. */
    available: number | null
}

// Estado de cada material del pedido: cuánto necesita, cuánto ya se descontó y
// cuánto hay. Es la base tanto del listado como del diálogo de descuento, para
// que los dos muestren exactamente los mismos números.
export async function materialNeeds(orderId: number): Promise<MaterialNeed[]> {
    const rows = await sql`
        SELECT
            oim.material_id,
            MIN(oim.label) AS label,
            SUM(oim.qty_total) AS required,
            COALESCE(MIN(i.available_stock), 0) AS available,
            (oim.material_id IS NOT NULL AND MIN(i.id) IS NOT NULL) AS en_inventario,
            COALESCE((
                SELECT SUM(sm.quantity)
                FROM stock_movements sm
                WHERE sm.order_id = ${orderId}
                  AND sm.material_id = oim.material_id
                  AND sm.movement_type = 'salida'
            ), 0) AS consumed
        FROM order_item_materials oim
        JOIN order_items oi ON oi.id = oim.order_item_id
        LEFT JOIN inventory i ON i.material_id = oim.material_id
        WHERE oi.order_id = ${orderId}
        GROUP BY oim.material_id
        ORDER BY MIN(oim.label) ASC
    `
    return (rows as any[]).map((r) => {
        const required = Number(r.required)
        const consumed = Number(r.consumed)
        return {
            material_id: r.material_id,
            label: r.label,
            required,
            consumed,
            pending: Math.max(required - consumed, 0),
            available: r.en_inventario ? Number(r.available) : null,
        }
    })
}
