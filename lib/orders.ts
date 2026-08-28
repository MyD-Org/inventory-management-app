import { resolveBom, type BomLine, type BomOption } from "@/lib/bom"
import { sql } from "@/lib/database"
import { customerStatus as toCustomerStatus, type OrderStatus as Status } from "@/lib/order-statuses"
import {
    validateOrderPayloadWith,
    validateSpecs,
    type OrderItemPayload,
    type OrderPayload,
    type SpecField,
    type SpecKind,
} from "@/lib/order-validation"

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

// Los tipos y la validación viven en lib/order-validation.ts, sin importar la
// base, para poder testearlos sin Postgres. Se reexportan por comodidad.
export {
    validateSpecs,
    validateOrderPayloadWith,
    type SpecKind,
    type SpecField,
    type OrderItemPayload,
    type OrderPayload,
} from "@/lib/order-validation"

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

export interface ResolvedProduct {
    /** Producto del catálogo de Alegra. null = no está allá, la línea no se puede facturar. */
    alegraItemId: number | null
    /** Hoja de costo, para explotar el BOM. null = el producto no tiene receta cargada. */
    budgetId: number | null
    label: string
}

// Identifica el producto de una línea de pedido.
//
// EL CATÁLOGO ES ALEGRA. Un producto existe porque está allá, con su precio; la
// hoja de costo es información opcional que dice cómo se fabrica. Antes era al
// revés —existía si tenía hoja— y eso dejaba productos que se vendían pero que el
// sistema no conocía, y obligaba a mantener dos catálogos en paralelo.
//
// Busca el PRODUCTO BASE, sin color: el color viaja en las specs y recién se usa
// al facturar, para elegir la variante. Solo ítems ACTIVOS: los 635 inactivos del
// catálogo son versiones viejas con precios viejos, y facturar uno de esos cobra
// mal.
//
// Devuelve null solo si el nombre no matchea nada, ni en Alegra ni en las hojas de
// costo. Que falte una de las dos no es un fallo: son señales distintas.
export async function resolveProduct(name: string): Promise<ResolvedProduct | null> {
    const clean = name.trim()
    const like = `%${clean}%`

    // Exacto primero; si no, parcial y solo si es UNO (ambiguo = mejor que lo mire
    // una persona que adivinar, sobre todo cuando de esto sale un precio).
    // account = 'Ventas' deja afuera las materias primas: en el catálogo conviven
    // los equipos con las grampas y arandelas que se compran para fabricarlos, y
    // un pedido de "grampa larga" es un error, no una venta.
    const items = await sql`
        SELECT alegra_id, base_name, (base_normalized = lower(${clean})) AS exact
        FROM alegra_items
        WHERE status = 'active' AND account = 'Ventas' AND variant_label IS NULL
          AND (base_normalized = lower(${clean}) OR base_name ILIKE ${like})
        ORDER BY exact DESC, alegra_id DESC
    `
    const exactItems = (items as any[]).filter((r) => r.exact)
    const item = exactItems.length > 0 ? exactItems[0] : items.length === 1 ? (items[0] as any) : null

    // La hoja de costo se busca por separado y con el mismo criterio.
    const budgets = await sql`
        SELECT id, name, (lower(name) = lower(${clean})) AS exact
        FROM budgets
        WHERE lower(name) = lower(${clean}) OR name ILIKE ${like}
        ORDER BY exact DESC, id DESC
    `
    const exactBudgets = (budgets as any[]).filter((r) => r.exact)
    const budget = exactBudgets.length > 0 ? exactBudgets[0] : budgets.length === 1 ? (budgets[0] as any) : null

    if (!item && !budget) return null

    return {
        alegraItemId: item ? Number(item.alegra_id) : null,
        budgetId: budget ? Number(budget.id) : null,
        // El nombre del catálogo manda: es el que va a figurar en la factura.
        label: (item?.base_name as string) ?? (budget?.name as string) ?? clean,
    }
}

// Productos que se le pueden vender a un cliente, para los selectores del alta
// de pedidos. Mismos filtros que resolveProduct(), y por la misma razón: el
// catálogo mezcla los equipos con las materias primas que se compran para
// fabricarlos, y el color es una variante del producto, no un producto.
//
// Antes estos selectores listaban las HOJAS DE COSTO. Cuando el catálogo pasó a
// ser Alegra quedaron apuntando a lo viejo: en producción hay 162 productos
// vendibles y 0 hojas de costo, así que no encontraban nada.
export async function listSellableProducts(): Promise<string[]> {
    const rows = await sql`
        SELECT DISTINCT base_name
        FROM alegra_items
        WHERE status = 'active' AND account = 'Ventas' AND variant_label IS NULL
        ORDER BY base_name ASC
    `
    return (rows as any[]).map((r) => r.base_name as string)
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
    /** Valores que el pedido pidió y la hoja de costo no mapea, p. ej. ["clamp=media"]. */
    unmapped_specs: string[]
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
    invoice_terms: string | null
    invoice_notes: string | null
    created_at: string
    updated_at: string
    /** Factura emitida en Alegra. null = todavía no se facturó. */
    alegra_invoice_id: number | null
    alegra_invoice_number: string | null
    /** Qué no se pudo facturar, si la factura salió incompleta. */
    invoice_warnings: string[]
    items: OrderItem[]
}

export async function readOrder(orderId: number): Promise<Order | null> {
    const overrides = await getCustomerStatusMap()
    const [order] = await sql`
        SELECT id, order_number, external_id, origin, customer_external_id, customer_name,
               customer_phone, status, priority,
               -- ::text para no arrastrar corrimiento de zona: es una fecha, no un instante
               delivery_date_estimate::text AS delivery_date_estimate,
               source_conversation, notes, invoice_terms, invoice_notes, created_at, updated_at,
               alegra_invoice_id, alegra_invoice_number, invoice_warnings
        FROM orders WHERE id = ${orderId}
    `
    if (!order) return null

    const items = await sql`
        SELECT id, line_no, budget_id, product, product_external_id, specs, quantity,
               needs_review, unmapped_specs
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

// Valida trayendo el vocabulario vigente de la base.
export async function validateOrderPayload(
    payload: OrderPayload,
    vocabOverride?: Record<string, SpecField>,
): Promise<string[]> {
    return validateOrderPayloadWith(payload, vocabOverride ?? (await getSpecs()))
}

// Explota la receta de un producto sobre una línea de pedido: copia congelada de
// budget_materials en order_item_materials.
//
// No es una copia literal. Una línea de receta puede variar según lo que pidió el
// cliente (la tira LED cálida y la azul son materiales distintos con precios
// distintos, aunque el equipo se cobre igual), así que acá se elige el material
// REAL con lib/bom.ts antes de insertar. Sin variantes cargadas el resultado es
// idéntico al INSERT … SELECT que había antes.
//
// Si el pedido trae un valor que la hoja no tiene mapeado, se cae al material de
// referencia —que puede ser el equivocado— y se anota en order_items.unmapped_specs,
// en vez de descontar en silencio del rollo que no era. NO usa needs_review: esa
// bandera significa "esta línea no tiene lista de materiales" y acá el BOM sí está.
export async function explodeBom(
    orderItemId: number,
    budgetId: number,
    specs: Record<string, unknown>,
    quantity: number,
): Promise<{ unmapped: string[] }> {
    const rows = await sql`
        SELECT
            bm.id, bm.material_id, bm.label, bm.qty, bm.spec_field_key,
            COALESCE(
                json_agg(
                    json_build_object('specValue', o.spec_value, 'materialId', o.material_id, 'label', o.label)
                    ORDER BY o.id
                ) FILTER (WHERE o.id IS NOT NULL),
                '[]'
            ) AS options
        FROM budget_materials bm
        LEFT JOIN budget_material_options o ON o.budget_material_id = bm.id
        WHERE bm.budget_id = ${budgetId}
        GROUP BY bm.id
        ORDER BY bm.id ASC
    `

    const lines: BomLine[] = rows.map((r) => ({
        id: r.id as number,
        materialId: r.material_id as number | null,
        label: r.label as string,
        qty: Number(r.qty),
        specFieldKey: (r.spec_field_key as string | null) ?? null,
        options: (r.options as BomOption[]).map((o) => ({
            specValue: String(o.specValue),
            materialId: o.materialId == null ? null : Number(o.materialId),
            label: String(o.label),
        })),
    }))

    const { lines: resolved, unmapped } = resolveBom(lines, specs, quantity)

    for (const line of resolved) {
        await sql`
            INSERT INTO order_item_materials (order_item_id, material_id, label, qty_per_unit, qty_total)
            VALUES (${orderItemId}, ${line.materialId}, ${line.label}, ${line.qty}, ${line.qtyTotal})
        `
    }

    // Se escribe SIEMPRE, también vacío: es un hecho derivado de las specs y la
    // receta actuales, no una marca que alguien tenga que ir a apagar. Corregir
    // el pedido y re-explotar lo limpia solo.
    await sql`
        UPDATE order_items
        SET unmapped_specs = ${JSON.stringify(unmapped)}::jsonb
        WHERE id = ${orderItemId}
    `

    return { unmapped }
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
        // Ya existe: devolvemos el mismo pedido en vez de duplicar.
        //
        // Salvo que esté A MEDIO ESCRIBIR. Dos casos reales:
        //   - Dos requests con el mismo external_id casi juntas (el bot
        //     reintenta tras un timeout): la perdedora entra acá mientras la
        //     ganadora todavía está insertando las líneas.
        //   - El proceso se murió a mitad del loop de abajo (timeout de la
        //     función, deploy, OOM) y el catch compensatorio nunca corrió.
        //
        // En los dos casos el pedido queda sin líneas y el UNIQUE impide
        // recrearlo, así que devolverlo como bueno lo deja roto para siempre.
        // Lo marcamos incompleto y que el bot reintente.
        const [existing] = await sql`SELECT id FROM orders WHERE external_id = ${externalId}`
        const order = await readOrder(existing.id)
        const incomplete = payload.items.length > 0 && (order?.items.length ?? 0) === 0
        return { created: false, incomplete, order }
    }

    const orderId = inserted[0].id as number

    try {
        for (const [idx, item] of payload.items.entries()) {
            const productName = String(item.product).trim()
            const quantity = Number(item.quantity ?? 1)
            const resolved = await resolveProduct(productName)

            // needs_review = no hay hoja de costo, o sea que la línea no aporta
            // materiales y el taller descuenta a mano. NO significa "no se puede
            // facturar": eso lo dice alegra_item_id en NULL, que es otra cosa y
            // la resuelve otra persona.
            const [line] = await sql`
                INSERT INTO order_items (
                    order_id, line_no, budget_id, alegra_item_id, product, product_external_id,
                    specs, quantity, needs_review
                )
                VALUES (
                    ${orderId}, ${idx + 1}, ${resolved?.budgetId ?? null},
                    ${resolved?.alegraItemId ?? null},
                    ${resolved?.label ?? productName},
                    ${item.product_external_id ?? null},
                    ${JSON.stringify(item.specs ?? {})}::jsonb,
                    ${quantity}, ${!resolved?.budgetId}
                )
                RETURNING id
            `

            // BOM: copia congelada de la receta. Sin hoja de costo no hay BOM, y
            // está bien: el producto igual existe y se puede facturar.
            if (resolved?.budgetId) {
                await explodeBom(line.id as number, resolved.budgetId, item.specs ?? {}, quantity)
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

// Agrega una línea a un pedido existente. Se usa desde la UI (server action) y
// desde el endpoint del agente de IA (auth con internal_secret).
export async function addOrderItemInternal(
    orderId: number,
    payload: OrderItemPayload,
) {
    const productName = payload.product?.trim()
    if (!productName) return { error: 'Elegí un producto' }
    const quantity = Number(payload.quantity ?? 1)
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'Cantidad inválida' }

    const specs = (payload.specs ?? {}) as Record<string, string>
    const specErrors = validateSpecs(specs, await getSpecs())
    if (specErrors.length > 0) return { error: specErrors.join('. ') }

    const resolved = await resolveProduct(productName)
    const [{ next }] = await sql`
        SELECT COALESCE(MAX(line_no), 0) + 1 AS next FROM order_items WHERE order_id = ${orderId}
    `

    const [line] = await sql`
        INSERT INTO order_items (order_id, line_no, budget_id, alegra_item_id, product, product_external_id, specs, quantity, needs_review)
        VALUES (
            ${orderId}, ${next}, ${resolved?.budgetId ?? null},
            ${resolved?.alegraItemId ?? null},
            ${resolved?.label ?? productName},
            ${payload.product_external_id ?? null},
            ${JSON.stringify(specs)}::jsonb,
            ${quantity}, ${!resolved?.budgetId}
        )
        RETURNING id
    `

    let unmapped: string[] = []
    if (resolved?.budgetId) {
        ({ unmapped } = await explodeBom(
            line.id as number,
            resolved.budgetId,
            specs,
            quantity,
        ))
    }

    return {
        ok: true,
        line_id: line.id,
        needs_review: !resolved?.budgetId,
        unmapped,
        sin_alegra: !resolved?.alegraItemId,
    }
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
