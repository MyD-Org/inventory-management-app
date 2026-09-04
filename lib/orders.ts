import { resolveBom, sameSpecs, type BomLine, type BomOption } from "@/lib/bom"
import { sql } from "@/lib/database"
import { customerStatus as toCustomerStatus, type OrderStatus as Status } from "@/lib/order-statuses"
import { logOrderEvent } from "@/lib/order-events"
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
/**
 * El vocabulario de variaciones.
 *
 * `soloCliente` deja afuera las variaciones INTERNAS —las que define el taller y
 * el cliente no elige—. Lo usa únicamente GET /api/specs, que es lo que consulta
 * el bot del CRM. Todo lo demás —la validación, el editor de ítems, las familias—
 * tiene que seguir viendo todos los campos: un campo interno igual se completa, lo
 * completa el taller.
 */
export async function getSpecs(
    opts: { soloCliente?: boolean } = {},
): Promise<Record<string, SpecField>> {
    const rows = opts.soloCliente
        ? await sql`
            SELECT f.key, f.label, f.free_text, f.kind, o.value, o.label AS option_label
            FROM spec_fields f
            LEFT JOIN spec_options o ON o.field_key = f.key AND o.active = TRUE
            WHERE f.active = TRUE AND f.offered_to_customer = TRUE
            ORDER BY f.position ASC, f.key ASC, o.position ASC, o.value ASC
        `
        : await sql`
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

// Qué opciones cambiaron entre las specs guardadas y las nuevas, con las
// etiquetas del vocabulario ("Óptica 90° → 30°") en vez de las claves crudas.
// Un valor que se borra se muestra como "—": el campo sigue existiendo, lo que
// pasa es que quedó sin especificar.
//
// Vive acá y no en la server action porque el hilo de actividad tiene que decir
// lo mismo lo edite una persona o el bot, y esas son dos entradas distintas.
export async function diffSpecs(
    antes: Record<string, string>,
    despues: Record<string, string>,
): Promise<Array<{ label: string; antes: string; despues: string }>> {
    const vocab = await getSpecs()
    const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
    const cambios: Array<{ label: string; antes: string; despues: string }> = []

    for (const key of claves) {
        const a = String(antes[key] ?? "")
        const b = String(despues[key] ?? "")
        if (a === b) continue
        const field = vocab[key]
        cambios.push({
            label: field?.label ?? key,
            antes: a ? (field?.labels?.[a] ?? a) : "—",
            despues: b ? (field?.labels?.[b] ?? b) : "—",
        })
    }
    return cambios
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
    /** El pedido cambió después de facturar y la factura todavía no se actualizó. */
    invoice_stale: boolean
    /** Remito emitido en Alegra. null = todavía no se remitió. */
    alegra_remission_id: number | null
    alegra_remission_number: string | null
    /** El pedido cambió después de remitir y el remito todavía no se actualizó. */
    remission_stale: boolean
    items: OrderItem[]
    modified_at: string | null
    delivery_date_verified_at: string | null
}

// De dónde entró el pedido. Lista cerrada: la columna es un varchar sin CHECK,
// así que sin esto la API guarda cualquier string y el hilo de actividad termina
// diciendo "creado desde pepito".
//
//   manual   → alguien lo cargó en la app (la web)
//   whatsapp → el bot
//   crm      → el CRM
//   api      → entró por la API sin declarar quién es
export const ORDER_ORIGINS = ["manual", "whatsapp", "crm", "api"] as const
export type OrderOrigin = (typeof ORDER_ORIGINS)[number]

export function isOrderOrigin(v: unknown): v is OrderOrigin {
    return typeof v === "string" && (ORDER_ORIGINS as readonly string[]).includes(v.trim().toLowerCase())
}

/** Deja el origen en minúscula y sin espacios; lo que no está en la lista cae en "manual". */
export function normalizeOrigin(v: unknown): OrderOrigin {
    const limpio = typeof v === "string" ? v.trim().toLowerCase() : ""
    return isOrderOrigin(limpio) ? (limpio as OrderOrigin) : "manual"
}

// El pedido cambió: los documentos ya emitidos en Alegra quedaron diciendo otra
// cosa. La llaman los tres caminos que tocan ítems, tanto desde la web como desde
// la API del CRM.
//
// MARCA CADA DOCUMENTO POR SEPARADO y solo si existe: un pedido puede tener la
// factura al día y el remito viejo, o al revés, porque se emiten y se actualizan
// independientemente. No hace nada si el pedido no tiene ninguno de los dos, así
// que se puede llamar sin preguntar antes.
export async function markDocumentsStale(orderId: number): Promise<void> {
    await sql`
        UPDATE orders SET
            invoice_stale = (alegra_invoice_id IS NOT NULL),
            remission_stale = (alegra_remission_id IS NOT NULL)
        WHERE id = ${orderId}
          AND (alegra_invoice_id IS NOT NULL OR alegra_remission_id IS NOT NULL)
    `
}

export async function readOrder(orderId: number): Promise<Order | null> {
    const overrides = await getCustomerStatusMap()
    const [order] = await sql`
        SELECT id, order_number, external_id, origin, customer_external_id, customer_name,
               customer_phone, status, priority,
               -- ::text para no arrastrar corrimiento de zona: es una fecha, no un instante
               delivery_date_estimate::text AS delivery_date_estimate,
               source_conversation, notes, invoice_terms, invoice_notes, created_at, updated_at,
               alegra_invoice_id, alegra_invoice_number, invoice_warnings, invoice_stale,
               alegra_remission_id, alegra_remission_number, remission_stale,
               modified_at::text AS modified_at,
               delivery_date_verified_at::text AS delivery_date_verified_at
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
//
// Para líneas que vienen de una familia, agrupa por (family_id, spec_value) y
// suma el stock disponible de TODAS las alternativas: si un color tiene dos
// materiales y entre los dos alcanza, no se reporta como faltante.
export async function missingMaterials(orderId: number): Promise<MissingMaterial[]> {
    const rows = await sql`
        SELECT
            oim.material_id,
            oim.label,
            oim.qty_total,
            oim.family_id,
            oim.spec_value,
            COALESCE(i.available_stock, 0) AS available
        FROM order_item_materials oim
        JOIN order_items oi ON oi.id = oim.order_item_id
        LEFT JOIN inventory i ON i.material_id = oim.material_id
        WHERE oi.order_id = ${orderId} AND oim.material_id IS NOT NULL
        ORDER BY oim.id ASC
    `

    const familyRows = (rows as any[]).filter((r) => r.family_id !== null)
    const familyIds = [...new Set(familyRows.map((r) => r.family_id as number))]
    const specValues = [...new Set(familyRows.map((r) => r.spec_value as string))]

    const stockByFamilySpec = new Map<string, number>()
    if (familyIds.length > 0 && specValues.length > 0) {
        const altRows = await sql`
            SELECT
                fo.family_id,
                fo.spec_value,
                COALESCE(SUM(i.available_stock), 0) AS available
            FROM material_family_options fo
            LEFT JOIN inventory i ON i.material_id = fo.material_id
            WHERE fo.family_id = ANY(${familyIds})
              AND fo.spec_value = ANY(${specValues})
            GROUP BY fo.family_id, fo.spec_value
        `
        for (const r of altRows as any[]) {
            stockByFamilySpec.set(`${r.family_id}:${r.spec_value}`, Number(r.available))
        }
    }

    const groups = new Map<string, MissingMaterial>()
    for (const r of rows as any[]) {
        const isFamily = r.family_id !== null
        const key = isFamily ? `fam:${r.family_id}:${r.spec_value}` : `mat:${r.material_id}`
        const required = Number(r.qty_total)
        const existing = groups.get(key)
        if (existing) {
            existing.required += required
            continue
        }

        const available = isFamily
            ? (stockByFamilySpec.get(`${r.family_id}:${r.spec_value}`) ?? 0)
            : Number(r.available)
        groups.set(key, {
            material_id: r.material_id as number,
            label: r.label as string,
            required,
            available,
            missing: Math.max(required - available, 0),
        })
    }

    return [...groups.values()]
        .filter((g) => g.required > g.available)
        .sort((a, b) => a.label.localeCompare(b.label))
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
// Si el pedido trae un valor que la hoja no tiene mapeado, esa línea NO aporta
// material: se anota en order_items.unmapped_specs y el taller decide qué sacar.
// Antes se caía al material de referencia y eso hacía descontar del rollo que no
// era. NO usa needs_review: esa bandera significa "esta línea no tiene lista de
// materiales" y acá el BOM sí está, solo que incompleto.
export async function explodeBom(
    orderItemId: number,
    budgetId: number,
    specs: Record<string, unknown>,
    quantity: number,
): Promise<{ unmapped: string[] }> {
    // Las variantes salen de la FAMILIA cuando la línea está vinculada a una
    // (material_families, ver scripts/19-material-families.sql) y de la foto
    // propia de la línea cuando no. El vínculo con la familia es vivo a
    // propósito: cambiar el material de un color en el inventario tiene que
    // valer para todos los productos sin reeditar hoja por hoja.
    // Si la familia quedó sin variantes, cae a la foto: es lo último que
    // alguien vio y revisó, mejor que explotar el BOM sin sustituciones.
    const rows = await sql`
        SELECT
            bm.id, bm.material_id, bm.label, bm.qty, bm.family_id,
            COALESCE(f.spec_field_key, bm.spec_field_key) AS spec_field_key,
            COALESCE(fam.options, own.options, '[]') AS options
        FROM budget_materials bm
        LEFT JOIN material_families f ON f.id = bm.family_id
        LEFT JOIN LATERAL (
            SELECT json_agg(
                json_build_object('specValue', fo.spec_value, 'materialId', fo.material_id, 'label', m.name, 'isDefault', fo.is_default)
                ORDER BY LOWER(fo.spec_value) ASC, m.name ASC
            ) AS options
            FROM material_family_options fo
            JOIN materials m ON m.id = fo.material_id
            WHERE fo.family_id = bm.family_id
        ) fam ON TRUE
        LEFT JOIN LATERAL (
            SELECT json_agg(
                json_build_object('specValue', o.spec_value, 'materialId', o.material_id, 'label', o.label, 'isDefault', TRUE)
                ORDER BY o.id
            ) AS options
            FROM budget_material_options o
            WHERE o.budget_material_id = bm.id
        ) own ON TRUE
        WHERE bm.budget_id = ${budgetId}
        ORDER BY bm.id ASC
    `

    const lines: BomLine[] = rows.map((r) => ({
        id: r.id as number,
        familyId: (r.family_id as number | null) ?? null,
        materialId: r.material_id as number | null,
        label: r.label as string,
        qty: Number(r.qty),
        specFieldKey: (r.spec_field_key as string | null) ?? null,
        options: (r.options as BomOption[]).map((o) => ({
            specValue: String(o.specValue),
            materialId: o.materialId == null ? null : Number(o.materialId),
            label: String(o.label),
            isDefault: o.isDefault ?? true,
        })),
    }))

    const { lines: resolved, unmapped } = resolveBom(lines, specs, quantity)

    for (const line of resolved) {
        await sql`
            INSERT INTO order_item_materials (order_item_id, material_id, label, qty_per_unit, qty_total, family_id, spec_value)
            VALUES (${orderItemId}, ${line.materialId}, ${line.label}, ${line.qty}, ${line.qtyTotal}, ${line.familyId ?? null}, ${line.specValue ?? null})
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

    // TODOS los pedidos entran por revisión, venga de donde venga el pedido.
    //
    // Antes los manuales arrancaban en "recibido" con el argumento de que ya los
    // había revisado quien los tipeó. No se sostiene: revisar no es haber tipeado,
    // es confirmar la fecha de entrega, que las variantes existan y que el cliente
    // sea el que corresponde. Y una columna que a veces se saltea deja de ser un
    // paso del flujo para pasar a ser una casualidad del origen.
    const origin = normalizeOrigin(payload.origin)
    const initialStatus = "por_revisar"

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
    /** Cómo se mide el material (unidad, metros, kg): las cantidades sin unidad mienten. */
    unit: string | null
    /** Origen de la alternativa, para ofrecer otras opciones al consumir. */
    family_id: number | null
    spec_value: string | null
    /** Otros materiales posibles para el mismo color/familia. */
    alternatives: Array<{ material_id: number; label: string; available: number | null }>
}

// Estado de cada material del pedido: cuánto necesita, cuánto ya se descontó y
// cuánto hay. Es la base tanto del listado como del diálogo de descuento, para
// que los dos muestren exactamente los mismos números.
//
// Las líneas que vienen de una familia se agrupan por (family_id, spec_value):
// un color puede tener varios materiales y el taller elige cuál consume. Las
// demás se agrupan por material_id como siempre.
export async function materialNeeds(orderId: number): Promise<MaterialNeed[]> {
    const rows = await sql`
        SELECT
            oim.material_id,
            oim.label,
            oim.qty_total,
            oim.family_id,
            oim.spec_value,
            COALESCE(i.available_stock, 0) AS available,
            m.unit_of_measure AS unit,
            (oim.material_id IS NOT NULL AND i.id IS NOT NULL) AS en_inventario
        FROM order_item_materials oim
        JOIN order_items oi ON oi.id = oim.order_item_id
        LEFT JOIN inventory i ON i.material_id = oim.material_id
        LEFT JOIN materials m ON m.id = oim.material_id
        WHERE oi.order_id = ${orderId}
        ORDER BY oim.id ASC
    `

    const familyRows = (rows as any[]).filter((r) => r.family_id !== null)
    const familyIds = [...new Set(familyRows.map((r) => r.family_id as number))]
    const specValues = [...new Set(familyRows.map((r) => r.spec_value as string))]

    const alternativesByFamilySpec = new Map<string, Array<{ material_id: number; label: string; available: number | null }>>()
    if (familyIds.length > 0 && specValues.length > 0) {
        const altRows = await sql`
            SELECT
                fo.family_id,
                fo.spec_value,
                fo.material_id,
                m.name AS label,
                i.available_stock
            FROM material_family_options fo
            JOIN materials m ON m.id = fo.material_id
            LEFT JOIN inventory i ON i.material_id = fo.material_id
            WHERE fo.family_id = ANY(${familyIds})
              AND fo.spec_value = ANY(${specValues})
            ORDER BY fo.is_default DESC, fo.id ASC
        `
        for (const r of altRows as any[]) {
            const key = `${r.family_id}:${r.spec_value}`
            const list = alternativesByFamilySpec.get(key) ?? []
            list.push({
                material_id: r.material_id as number,
                label: r.label as string,
                available: r.available_stock == null ? null : Number(r.available_stock),
            })
            alternativesByFamilySpec.set(key, list)
        }
    }

    const groups = new Map<string, MaterialNeed>()
    for (const r of rows as any[]) {
        const isFamily = r.family_id !== null
        const key = isFamily ? `fam:${r.family_id}:${r.spec_value}` : `mat:${r.material_id}`
        const required = Number(r.qty_total)
        const existing = groups.get(key)
        if (existing) {
            existing.required += required
            continue
        }

        if (isFamily) {
            const altKey = `${r.family_id}:${r.spec_value}`
            const alternatives = alternativesByFamilySpec.get(altKey) ?? []
            groups.set(key, {
                material_id: r.material_id as number,
                label: r.label as string,
                required,
                consumed: 0,
                pending: 0,
                available: r.en_inventario ? Number(r.available) : null,
                unit: (r.unit as string | null) ?? null,
                family_id: r.family_id as number,
                spec_value: r.spec_value as string,
                alternatives,
            })
        } else {
            groups.set(key, {
                material_id: r.material_id as number | null,
                label: r.label as string,
                required,
                consumed: 0,
                pending: 0,
                available: r.en_inventario ? Number(r.available) : null,
                unit: (r.unit as string | null) ?? null,
                family_id: null,
                spec_value: null,
                alternatives: [],
            })
        }
    }

    const materialIds = [...groups.values()]
        .map((g) => g.material_id)
        .filter((id): id is number => id !== null)
    const alternativeIds = [...groups.values()].flatMap((g) => g.alternatives.map((a) => a.material_id))
    const allIds = [...new Set([...materialIds, ...alternativeIds])]

    const consumedByMaterial = new Map<number, number>()
    if (allIds.length > 0) {
        const consumedRows = await sql`
            SELECT material_id, COALESCE(SUM(quantity), 0) AS consumed
            FROM stock_movements
            WHERE order_id = ${orderId}
              AND movement_type = 'salida'
              AND material_id = ANY(${allIds})
            GROUP BY material_id
        `
        for (const r of consumedRows as any[]) {
            consumedByMaterial.set(r.material_id as number, Number(r.consumed))
        }
    }

    for (const need of groups.values()) {
        const consumedMain = need.material_id !== null ? (consumedByMaterial.get(need.material_id) ?? 0) : 0
        const consumedAlts = need.alternatives.reduce(
            (sum, a) => sum + (consumedByMaterial.get(a.material_id) ?? 0),
            0,
        )
        need.consumed = consumedMain + consumedAlts
        need.pending = Math.max(need.required - need.consumed, 0)
    }

    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
}

// ---------- Edición interna de ítems ----------
// Funciones sin auth ni revalidación. Las usan los endpoints de la API
// (autenticación server-to-server) y las server actions de la web (auth de
// sesión + revalidación + bloqueo por factura).

export type AddOrderItemResult =
    | { ok: false; error: string }
    | { ok: true; itemId: number; needs_review: boolean; unmapped: string[]; sin_alegra: boolean }

export type UpdateOrderItemResult =
    | { ok: false; error: string }
    | { ok: true; itemId: number; warning?: string }

export type DeleteOrderItemResult =
    | { ok: false; error: string }
    | { ok: true; itemId: number }

export async function addOrderItemInternal(
    orderId: number,
    payload: { product: string; quantity: number; specs?: Record<string, string> },
): Promise<AddOrderItemResult> {
    if (!payload.product?.trim()) return { ok: false, error: "Elegí un producto" }
    if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) return { ok: false, error: "Cantidad inválida" }

    const errors = validateSpecs(payload.specs ?? {}, await getSpecs())
    if (errors.length > 0) return { ok: false, error: errors.join(". ") }

    try {
        const resolved = await resolveProduct(payload.product.trim())
        const [{ next }] = await sql`
            SELECT COALESCE(MAX(line_no), 0) + 1 AS next FROM order_items WHERE order_id = ${orderId}
        `

        const [line] = await sql`
            INSERT INTO order_items (order_id, line_no, budget_id, alegra_item_id, product, specs, quantity, needs_review)
            VALUES (
                ${orderId}, ${next}, ${resolved?.budgetId ?? null},
                ${resolved?.alegraItemId ?? null},
                ${resolved?.label ?? payload.product.trim()},
                ${JSON.stringify(payload.specs ?? {})}::jsonb,
                ${payload.quantity}, ${!resolved?.budgetId}
            )
            RETURNING id
        `

        let unmapped: string[] = []
        if (resolved?.budgetId) {
            ({ unmapped } = await explodeBom(
                line.id as number,
                resolved.budgetId,
                payload.specs ?? {},
                payload.quantity,
            ))
        }

        return {
            ok: true,
            itemId: line.id as number,
            needs_review: !resolved?.budgetId,
            unmapped,
            sin_alegra: !resolved?.alegraItemId,
        }
    } catch (error) {
        console.error("Error en addOrderItemInternal:", error)
        return { ok: false, error: "No se pudo agregar la línea" }
    }
}

export async function updateOrderItemInternal(
    itemId: number,
    patch: { quantity?: number; specs?: Record<string, string>; product?: string },
): Promise<UpdateOrderItemResult> {
    try {
        const [item] = await sql`
            SELECT order_id, quantity, budget_id, specs, product FROM order_items WHERE id = ${itemId}
        `
        if (!item) return { ok: false, error: "La línea no existe" }

        if (patch.specs) {
            const errors = validateSpecs(patch.specs, await getSpecs())
            if (errors.length > 0) return { ok: false, error: errors.join(". ") }
        }

        const quantity = patch.quantity ?? Number(item.quantity)
        if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: "Cantidad inválida" }

        // Cambiar el producto no es editar un texto: es cambiar la receta. Se
        // vuelve a resolver la hoja de costo, el ítem de Alegra y needs_review,
        // y más abajo se rehace la lista de materiales igual que con las specs.
        const pedido = patch.product?.trim()
        const productChanged = Boolean(pedido) && pedido !== item.product
        const resolved = productChanged ? await resolveProduct(pedido as string) : null
        const budgetId = productChanged ? (resolved?.budgetId ?? null) : (item.budget_id as number | null)

        await sql`
            UPDATE order_items SET
                quantity = ${quantity},
                specs = COALESCE(${patch.specs ? JSON.stringify(patch.specs) : null}::jsonb, specs)
            WHERE id = ${itemId}
        `

        if (productChanged) {
            await sql`
                UPDATE order_items SET
                    product = ${resolved?.label ?? pedido},
                    budget_id = ${resolved?.budgetId ?? null},
                    alegra_item_id = ${resolved?.alegraItemId ?? null},
                    needs_review = ${!resolved?.budgetId}
                WHERE id = ${itemId}
            `
        }

        const specsChanged =
            patch.specs !== undefined && !sameSpecs(patch.specs, (item.specs ?? {}) as Record<string, unknown>)
        const specsFinales = (patch.specs ?? (item.specs ?? {})) as Record<string, string>
        let consumed = false

        if (specsChanged || productChanged) {
            const [{ count }] = await sql`
                SELECT COUNT(*)::int AS count FROM stock_movements
                WHERE order_id = ${item.order_id} AND movement_type = 'salida'
            `
            consumed = count > 0
            if (!consumed) {
                const previo = await sql`
                    SELECT material_id, label, qty_per_unit, qty_total
                    FROM order_item_materials WHERE order_item_id = ${itemId} ORDER BY id ASC
                `
                await sql`DELETE FROM order_item_materials WHERE order_item_id = ${itemId}`
                try {
                    // Sin hoja de costo la línea queda en needs_review y sin
                    // materiales: el borrado de arriba ya la dejó así.
                    if (budgetId) await explodeBom(itemId, budgetId, specsFinales, quantity)
                } catch (error) {
                    await sql`DELETE FROM order_item_materials WHERE order_item_id = ${itemId}`
                    for (const m of previo) {
                        await sql`
                            INSERT INTO order_item_materials (order_item_id, material_id, label, qty_per_unit, qty_total)
                            VALUES (${itemId}, ${m.material_id}, ${m.label}, ${m.qty_per_unit}, ${m.qty_total})
                        `
                    }
                    throw error
                }
            }
        }

        const reexploded = (specsChanged || productChanged) && Boolean(budgetId) && !consumed
        if (!reexploded && patch.quantity !== undefined) {
            await sql`
                UPDATE order_item_materials
                SET qty_total = qty_per_unit * ${quantity}
                WHERE order_item_id = ${itemId}
            `
        }

        // Cambiar a un producto sin hoja de costo deja la línea sin materiales: se
        // avisa, porque en pantalla el cambio se ve igual de exitoso.
        if (productChanged && !budgetId) {
            return {
                ok: true,
                itemId,
                warning:
                    "El producto nuevo no tiene hoja de costo cargada, así que esta línea quedó sin lista de materiales.",
            }
        }

        if (consumed) {
            return {
                ok: true,
                itemId,
                warning:
                    "Se guardaron los cambios, pero los materiales no se recalcularon porque este pedido ya descontó stock. Revisá el descuento a mano.",
            }
        }
        return { ok: true, itemId }
    } catch (error) {
        console.error("Error en updateOrderItemInternal:", error)
        return { ok: false, error: "No se pudo guardar la línea" }
    }
}

export async function deleteOrderItemInternal(itemId: number): Promise<DeleteOrderItemResult> {
    try {
        const [item] = await sql`SELECT order_id FROM order_items WHERE id = ${itemId}`
        if (!item) return { ok: false, error: "La línea no existe" }

        const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = ${item.order_id}`
        if (count <= 1) return { ok: false, error: "Un pedido no puede quedar sin líneas" }

        await sql`DELETE FROM order_items WHERE id = ${itemId}`
        return { ok: true, itemId }
    } catch (error) {
        console.error("Error en deleteOrderItemInternal:", error)
        return { ok: false, error: "No se pudo borrar la línea" }
    }
}

// ---------- Reconciliación de BOMs pendientes ----------

export interface ReconciledItem {
    itemId: number
    product: string
    unmapped: string[]
}

// Pone al día el BOM del pedido al abrirlo. Hace dos cosas:
//   1. Vuelve a resolver las líneas marcadas needs_review (el producto no tenía
//      hoja de costo cuando se cargó el pedido) y, si la hoja ya existe, explota
//      el BOM y baja la bandera.
//   2. Rehace el BOM de las líneas con valores sin mapear, que se armaron cuando
//      esos casos caían al material de referencia.
//
// Por qué acá y no un botón: que falte la hoja de costo NO es un dato del
// pedido, es un dato del catálogo que cambia por su cuenta. Congelar el BOM al
// crear el pedido tiene sentido cuando HAY receta —cambiarla después no debe
// reescribir pedidos en marcha—, pero cuando no había nada que congelar la
// marca roja quedaba pegada para siempre aunque el taller cargara la hoja al
// rato.
//
// Es conservadora a propósito. No toca nada si:
//   - el pedido ya salió (retirado) o se canceló: ahí el BOM es historia;
//   - ya se descontó stock: mismo criterio que updateOrderItemInternal, meter
//     materiales nuevos abajo de un descuento hecho deja los números mintiendo;
//   - la hoja existe pero está vacía: sin materiales la línea se sigue armando
//     a mano, así que la advertencia tiene que quedar.
//
// Nunca hace throw: es un efecto de abrir la pantalla, no puede voltear la
// lectura del pedido.
export async function reconcileOrderBoms(orderId: number): Promise<ReconciledItem[]> {
    try {
        const [order] = await sql`SELECT status FROM orders WHERE id = ${orderId}`
        if (!order) return []
        if (order.status === "retirado" || order.status === "cancelado") return []

        const [{ count }] = await sql`
            SELECT COUNT(*)::int AS count FROM stock_movements
            WHERE order_id = ${orderId} AND movement_type = 'salida'
        `
        if (count > 0) return []

        // Limpieza 1: ítems huérfanos que quedaron con unmapped_specs pero sin
        // budget_id. Pasa cuando alguien borra la hoja de costo a mano o queda
        // un estado inconsistente: sin hoja de costo debe ser needs_review.
        const itemsSinBudgetConUnmapped = await sql`
            SELECT id
            FROM order_items
            WHERE order_id = ${orderId}
              AND budget_id IS NULL
              AND needs_review = FALSE
              AND jsonb_array_length(COALESCE(unmapped_specs, '[]'::jsonb)) > 0
            ORDER BY line_no ASC
        `
        for (const item of itemsSinBudgetConUnmapped as any[]) {
            await sql`DELETE FROM order_item_materials WHERE order_item_id = ${item.id}`
            await sql`
                UPDATE order_items
                SET needs_review = TRUE,
                    unmapped_specs = '[]'::jsonb
                WHERE id = ${item.id}
            `
        }

        // Limpieza 2: si una hoja de costo se borró o quedó vacía después de
        // vincularse al pedido, el ítem queda con un budget_id inválido y
        // muestra "variante sin resolver" en vez de "sin lista de materiales".
        // Se desvincula y vuelve a needs_review para que el taller lo arme a mano.
        const itemsConBudgetInvalido = await sql`
            SELECT oi.id
            FROM order_items oi
            WHERE oi.order_id = ${orderId}
              AND oi.budget_id IS NOT NULL
              AND oi.needs_review = FALSE
              AND (
                  NOT EXISTS (SELECT 1 FROM budgets b WHERE b.id = oi.budget_id)
                  OR NOT EXISTS (SELECT 1 FROM budget_materials bm WHERE bm.budget_id = oi.budget_id)
              )
            ORDER BY oi.line_no ASC
        `
        for (const item of itemsConBudgetInvalido as any[]) {
            await sql`DELETE FROM order_item_materials WHERE order_item_id = ${item.id}`
            await sql`
                UPDATE order_items
                SET budget_id = NULL,
                    needs_review = TRUE,
                    unmapped_specs = '[]'::jsonb
                WHERE id = ${item.id}
            `
        }

        const pendientes = await sql`
            SELECT id, product, specs, quantity
            FROM order_items
            WHERE order_id = ${orderId} AND needs_review = TRUE
            ORDER BY line_no ASC
        `

        const arregladas: ReconciledItem[] = []

        for (const item of pendientes as any[]) {
            const resolved = await resolveProduct(String(item.product))
            if (!resolved?.budgetId) continue

            const [{ count: lineas }] = await sql`
                SELECT COUNT(*)::int AS count FROM budget_materials WHERE budget_id = ${resolved.budgetId}
            `
            if (lineas === 0) continue

            // No debería haber materiales (la línea nunca explotó), pero si algo
            // quedó a medias de un intento anterior, se rehace limpio.
            await sql`DELETE FROM order_item_materials WHERE order_item_id = ${item.id}`
            const { unmapped } = await explodeBom(
                item.id as number,
                resolved.budgetId,
                (item.specs ?? {}) as Record<string, unknown>,
                Number(item.quantity),
            )

            // El nombre del producto NO se pisa: es lo que el cliente pidió y lo
            // que el taller viene leyendo. alegra_item_id solo se completa si
            // estaba vacío; si ya había uno, alguien lo eligió.
            await sql`
                UPDATE order_items
                SET budget_id = ${resolved.budgetId},
                    alegra_item_id = COALESCE(alegra_item_id, ${resolved.alegraItemId}),
                    needs_review = FALSE
                WHERE id = ${item.id}
            `

            arregladas.push({ itemId: item.id as number, product: String(item.product), unmapped })
        }

        // Segunda pasada: líneas que SÍ tienen hoja de costo pero quedaron con
        // algún valor sin mapear. Su BOM se armó cuando esos casos caían al
        // material de referencia; hoy no se elige ninguno, así que hay que
        // rehacerlo para que no quede listado un material que nadie eligió.
        const conHuecos = await sql`
            SELECT id, budget_id, specs, quantity
            FROM order_items
            WHERE order_id = ${orderId}
              AND needs_review = FALSE
              AND budget_id IS NOT NULL
              AND jsonb_array_length(COALESCE(unmapped_specs, '[]'::jsonb)) > 0
            ORDER BY line_no ASC
        `
        for (const item of conHuecos as any[]) {
            await sql`DELETE FROM order_item_materials WHERE order_item_id = ${item.id}`
            await explodeBom(
                item.id as number,
                item.budget_id as number,
                (item.specs ?? {}) as Record<string, unknown>,
                Number(item.quantity),
            )
        }

        for (const item of arregladas) {
            await logOrderEvent(orderId, {
                kind: "item_updated",
                field: "materiales",
                newValue: item.product,
                body: `Se cargó la lista de materiales de "${item.product}", que antes no tenía hoja de costo.`,
                actor: { name: "Sistema" },
            })
        }

        return arregladas
    } catch (error) {
        console.error("Error en reconcileOrderBoms:", error)
        return []
    }
}
