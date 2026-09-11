import { sql } from "@/lib/database"
import {
    createRemission,
    findRemissionByNumber,
    getRemission,
    type EstimateLine,
    type ExistingInvoice,
} from "@/lib/alegra"
import { previewInvoice, type InvoicePreview } from "@/lib/invoicing"
import {
    deliveryState,
    planDelivery,
    round2,
    type DeliverableItem,
    type DeliveryRequestItem,
    type DeliveryState,
} from "@/lib/deliveries"

// Remitos del pedido en Alegra: qué mercadería sale del depósito, y cuánta.
//
// UN PEDIDO PUEDE TENER VARIOS. La mercadería sale por partes —4 luminarias hoy,
// las 6 que faltan la semana que viene— y cada salida es un remito propio, con su
// papel y su número. Lo remitido de cada línea es la suma de sus líneas de remito
// (ver scripts/41-remitos-parciales.sql); lo pendiente es lo pedido menos eso.
//
// REUSA LA RESOLUCIÓN DE LA FACTURA. Qué ítem de Alegra corresponde a cada línea
// del pedido —la variante por color, el producto base cuando la variante no
// existe, los agregados que facturan aparte como la estaca— es exactamente el
// mismo problema, y ya está resuelto en previewInvoice. Duplicar esa lógica sería
// garantizar que las dos versiones se separen con el primer cambio.
//
// LO ÚNICO QUE CAMBIA ES EL PRECIO: las líneas van en 0. Un remito dice QUÉ sale,
// no cuánto vale, y es el papel que más circula por el depósito. Es la misma
// decisión que se ve en los remitos que ya hay cargados a mano en la cuenta.
//
// INDEPENDIENTE DE LA FACTURA, EN CUALQUIER ORDEN: a veces se remite y se factura
// después, a veces al revés. Ninguno espera al otro. La factura sigue siendo UNA
// —el cliente paga el pedido entero— y por eso invoiceOrder sí es idempotente.
//
// UN REMITO EMITIDO NO SE CORRIGE, y por eso acá no hay nada parecido a
// updateOrderInvoice. La factura es una sola y se reescribe cuando el pedido
// cambia; el remito dice qué mercadería salió ESE día, y eso no cambia porque el
// pedido haya cambiado después. Lo que falta sale en otro remito —para eso está
// remitOrder de nuevo— y un papel realmente mal emitido se anula en Alegra, que es
// donde vive la contabilidad.

export interface RemissionLine {
    /** De qué línea del pedido salió este renglón. */
    orderItemId: number
    alegraItemId: number
    name: string
    quantity: number
    description: string
}

/** Una línea del pedido con su cuenta de remitos, para el diálogo de remitir. */
export interface DeliverableLine {
    orderItemId: number
    product: string
    ordered: number
    delivered: number
    pending: number
}

/** Un remito ya emitido del pedido. */
export interface EmittedRemission {
    id: number
    alegraId: number | null
    number: string | null
    url: string | null
    remittedAt: string
    actorName: string | null
    warnings: string[]
    items: Array<{ product: string; quantity: number }>
}

export interface RemissionResult {
    orderId: number
    clientId: number | null
    clientName: string | null
    lines: RemissionLine[]
    warnings: string[]
    remissionId: number | null
    remissionNumber: string | null
    remissionUrl: string | null
    /** Cómo queda el pedido: lo pedido, lo remitido y lo que falta, por línea. */
    delivery: DeliverableLine[]
    deliveryState: DeliveryState
    /** true = solo se calculó, no se emitió nada. */
    dryRun: boolean
}

function remissionUrl(alegraId: number | null | undefined): string | null {
    return alegraId ? `https://app.alegra.com/remission/view/id/${alegraId}` : null
}

/** Lo pedido y lo remitido de cada línea. Es la base de todo lo de acá abajo. */
export async function deliverableItems(orderId: number): Promise<DeliverableItem[]> {
    const rows = await sql`
        SELECT id, product, quantity, delivered_quantity
        FROM order_items WHERE order_id = ${orderId} ORDER BY line_no ASC
    `
    return (rows as any[]).map((r) => ({
        id: Number(r.id),
        product: r.product as string,
        quantity: Number(r.quantity),
        delivered: Number(r.delivered_quantity ?? 0),
    }))
}

function toDeliverableLines(items: DeliverableItem[]): DeliverableLine[] {
    return items.map((i) => ({
        orderItemId: i.id,
        product: i.product,
        ordered: i.quantity,
        delivered: i.delivered,
        pending: Math.max(0, round2(i.quantity - i.delivered)),
    }))
}

/**
 * Recalcula lo remitido de cada línea a partir de los remitos.
 *
 * ENTERO Y NO INCREMENTAL a propósito: order_items.delivered_quantity es una
 * caché de la suma de order_remission_items, y sumarle el delta de la última
 * emisión haría que un error se quedara pegado para siempre. Recalculado, un
 * desajuste se arregla solo con el próximo remito.
 */
export async function refreshDeliveredQuantities(orderId: number): Promise<void> {
    await sql`
        UPDATE order_items i
        SET delivered_quantity = COALESCE((
            SELECT SUM(ri.quantity)
            FROM order_remission_items ri
            WHERE ri.order_item_id = i.id
        ), 0)
        WHERE i.order_id = ${orderId}
    `
}

/** Los remitos ya emitidos del pedido, del más viejo al más nuevo. */
export async function listOrderRemissions(orderId: number): Promise<EmittedRemission[]> {
    const rows = await sql`
        SELECT id, alegra_remission_id, alegra_remission_number, remitted_at, actor_name, warnings
        FROM order_remissions WHERE order_id = ${orderId}
        ORDER BY remitted_at ASC, id ASC
    `
    if ((rows as any[]).length === 0) return []

    const ids = (rows as any[]).map((r) => r.id)
    const items = await sql`
        SELECT remission_id, product, quantity FROM order_remission_items
        WHERE remission_id = ANY(${ids}) ORDER BY id ASC
    `
    return (rows as any[]).map((r) => ({
        id: Number(r.id),
        alegraId: r.alegra_remission_id ? Number(r.alegra_remission_id) : null,
        number: (r.alegra_remission_number as string) ?? null,
        url: remissionUrl(r.alegra_remission_id),
        remittedAt: String(r.remitted_at),
        actorName: (r.actor_name as string) ?? null,
        warnings: (r.warnings as string[]) ?? [],
        items: (items as any[])
            .filter((i) => Number(i.remission_id) === Number(r.id))
            .map((i) => ({ product: i.product as string, quantity: Number(i.quantity) })),
    }))
}

/**
 * Los renglones de Alegra de una entrega, sin importes.
 *
 * EL RECORTE ES PROPORCIONAL: previewInvoice resuelve el pedido ENTERO, y una
 * línea del pedido puede dar varios renglones —el producto y sus agregados, que
 * salen a razón de tantos por unidad—. Entregar 4 de 10 es entregar los mismos
 * renglones a 4/10, y así la estaca que va con cada luminaria sale en la cantidad
 * que corresponde sin tener que volver a resolver el mapa de agregados.
 */
function toRemissionLines(
    preview: InvoicePreview,
    ordered: Map<number, number>,
    entrega: Array<{ orderItemId: number; quantity: number }>,
): RemissionLine[] {
    const porItem = new Map(entrega.map((e) => [e.orderItemId, e.quantity]))
    const lines: RemissionLine[] = []

    for (const l of preview.lines) {
        const aEntregar = porItem.get(l.orderItemId)
        if (aEntregar == null || aEntregar <= 0) continue

        const total = ordered.get(l.orderItemId) ?? 0
        // Sin cantidad pedida no hay proporción posible; el renglón se manda tal
        // cual antes que inventar un número.
        const factor = total > 0 ? aEntregar / total : 1
        const quantity = round2(l.quantity * factor)
        if (quantity <= 0) continue

        lines.push({
            orderItemId: l.orderItemId,
            alegraItemId: l.alegraItemId,
            name: l.name,
            quantity,
            description: l.description,
        })
    }
    return lines
}

/** Qué líneas del pedido no llegaron a ningún renglón de Alegra. */
function avisarLineasSinRenglon(
    entrega: Array<{ orderItemId: number; product: string; quantity: number }>,
    lines: RemissionLine[],
): { remitidas: typeof entrega; warnings: string[] } {
    const conRenglon = new Set(lines.map((l) => l.orderItemId))
    const remitidas = entrega.filter((e) => conRenglon.has(e.orderItemId))
    const warnings = entrega
        .filter((e) => !conRenglon.has(e.orderItemId))
        .map((e) => `"${e.product}" no se incluyó en el remito: queda sin remitir.`)
    return { remitidas, warnings }
}

// El vínculo con la factura se deja escrito: Alegra no relaciona un remito con una
// factura ya emitida —no existe el campo—, y esto es lo que va a leer quien abra
// el documento allá sin tener el pedido a mano. Cuando la entrega es parcial se
// dice, porque el mismo pedido va a tener otro remito con el resto.
function observaciones(orderId: number, invoiceNumber: string | null, parcial: boolean): string {
    const partes = [`Pedido #${orderId}`]
    if (parcial) partes.push("Entrega parcial")
    if (invoiceNumber) partes.push(`Factura ${invoiceNumber}`)
    return partes.join(" · ")
}

/** Qué diría el remito si se emitiera ahora. No toca Alegra ni escribe nada. */
export async function previewRemission(
    orderId: number,
    request: DeliveryRequestItem[] | null = null,
): Promise<RemissionResult> {
    const items = await deliverableItems(orderId)
    const preview = await previewInvoice(orderId)
    const [ultimo] = await sql`
        SELECT alegra_remission_id, alegra_remission_number FROM orders WHERE id = ${orderId}
    `

    const plan = planDelivery(items, request)
    const entrega = "error" in plan ? [] : plan.items
    const ordered = new Map(items.map((i) => [i.id, i.quantity]))
    const lines = toRemissionLines(preview, ordered, entrega)

    // El aviso del plan es parte de lo que la pantalla tiene que mostrar: "ya está
    // remitido por completo" no es un error del servidor, es el estado del pedido.
    const warnings = [...preview.warnings]
    if ("error" in plan) warnings.push(plan.error)
    else warnings.push(...avisarLineasSinRenglon(entrega, lines).warnings)

    return {
        orderId,
        clientId: preview.clientId,
        clientName: preview.clientName,
        lines,
        warnings,
        remissionId: ultimo?.alegra_remission_id ? Number(ultimo.alegra_remission_id) : null,
        remissionNumber: (ultimo?.alegra_remission_number as string) ?? null,
        remissionUrl: remissionUrl(ultimo?.alegra_remission_id),
        delivery: toDeliverableLines(items),
        deliveryState: deliveryState(items),
        dryRun: true,
    }
}

/**
 * Emite UN remito con lo que se entrega ahora y lo deja anotado en el pedido.
 *
 * `request` en null significa "todo lo pendiente": es el caso normal —el pedido
 * sale completo— y es lo que hace la emisión automática al pasar a "Preparando
 * entrega", que no tiene a quién preguntarle cantidades.
 *
 * YA NO ES IDEMPOTENTE, y ese es justamente el cambio: antes un segundo remito
 * significaba que la mercadería había salido dos veces, y ahora significa que
 * salió el resto. Lo que protege de duplicar es OTRA cosa: no se puede remitir
 * más de lo pendiente (ver planDelivery), así que un pedido ya remitido por
 * completo no deja emitir nada.
 */
export async function remitOrder(
    orderId: number,
    request: DeliveryRequestItem[] | null = null,
    actor?: { name: string; email?: string | null },
): Promise<RemissionResult> {
    const [order] = await sql`
        SELECT alegra_invoice_number FROM orders WHERE id = ${orderId}
    `
    if (!order) throw new Error("El pedido no existe")

    const items = await deliverableItems(orderId)
    const plan = planDelivery(items, request)
    if ("error" in plan) throw new Error(plan.error)

    const preview = await previewInvoice(orderId)
    if (preview.clientId == null) {
        throw new Error("El pedido no tiene cliente de Alegra: no se puede emitir el remito.")
    }

    const ordered = new Map(items.map((i) => [i.id, i.quantity]))
    const lines = toRemissionLines(preview, ordered, plan.items)
    if (lines.length === 0) {
        throw new Error("Ninguna línea del pedido se pudo resolver contra el catálogo de Alegra.")
    }

    // Lo que no llegó a un renglón de Alegra NO se marca como remitido: el papel
    // no lo dice, así que el pedido tampoco. Queda pendiente y avisado.
    const { remitidas, warnings: sinRenglon } = avisarLineasSinRenglon(plan.items, lines)
    const warnings = [...preview.warnings, ...sinRenglon]

    // Parcial = después de esta entrega el pedido todavía tiene algo pendiente.
    const quedaPendiente = items.some((i) => {
        const sale = remitidas.find((e) => e.orderItemId === i.id)?.quantity ?? 0
        return i.quantity - i.delivered - sale > 0.005
    })

    const lineas: EstimateLine[] = lines.map((l) => ({
        id: l.alegraItemId,
        description: l.description,
        // Ver arriba: el remito no lleva plata.
        price: 0,
        quantity: l.quantity,
    }))

    const creado = await createRemission({
        clientId: preview.clientId,
        lines: lineas,
        observations: observaciones(orderId, (order.alegra_invoice_number as string) ?? null, quedaPendiente),
    })

    // Recién con Alegra confirmando se anota el remito: si la emisión falla, el
    // pedido no puede quedar diciendo que la mercadería salió.
    const [remito] = await sql`
        INSERT INTO order_remissions (
            order_id, alegra_remission_id, alegra_remission_number, warnings, actor_name, actor_email
        )
        VALUES (
            ${orderId}, ${creado.id}, ${creado.number},
            ${JSON.stringify(warnings)}::jsonb, ${actor?.name ?? null}, ${actor?.email ?? null}
        )
        RETURNING id
    `
    for (const linea of remitidas) {
        await sql`
            INSERT INTO order_remission_items (remission_id, order_item_id, product, quantity)
            VALUES (${remito.id}, ${linea.orderItemId}, ${linea.product}, ${linea.quantity})
        `
    }
    await refreshDeliveredQuantities(orderId)

    // Las columnas de `orders` son el espejo del ÚLTIMO remito: las leen el
    // tablero, la lista y el selector de estado (ver scripts/41-remitos-parciales.sql).
    await sql`
        UPDATE orders SET
            alegra_remission_id = ${creado.id},
            alegra_remission_number = ${creado.number},
            alegra_remitted_at = NOW(),
            remission_synced_at = NOW(),
            remission_warnings = ${JSON.stringify(warnings)}::jsonb
        WHERE id = ${orderId}
    `

    const despues = await deliverableItems(orderId)
    return {
        orderId,
        clientId: preview.clientId,
        clientName: preview.clientName,
        lines,
        warnings,
        remissionId: creado.id,
        remissionNumber: creado.number,
        remissionUrl: creado.url,
        delivery: toDeliverableLines(despues),
        deliveryState: deliveryState(despues),
        dryRun: false,
    }
}

// ── Vincular un remito que YA estaba en Alegra ───────────────────────────────
//
// Lo mismo que con la factura: el remito se hizo a mano en Alegra —antes de que el
// pedido existiera en la app, o porque la mercadería salió apurada— y emitir otro
// sería decir que la mercadería salió dos veces.
//
// A DIFERENCIA DE LA FACTURA, HAY QUE DECIR CUÁNTO CUBRE. El pedido lleva la cuenta
// de lo remitido línea por línea, y un remito vinculado sin cantidades dejaría el
// pedido diciendo "faltan 10" con el papel de esas 10 ya emitido. Quien vincula
// dice qué cantidades nombra el papel; por defecto, todo lo pendiente.
//
// NO SE LEEN LAS LÍNEAS DEL REMITO para deducirlo: un remito hecho a mano nombra los
// productos como quiso quien lo cargó —el producto base en vez de la variante, la
// estaca aparte o no— y adivinar a qué línea del pedido va cada renglón es
// equivocarse en silencio. Lo decide la persona que tiene el papel adelante.

export interface LinkedRemission extends ExistingInvoice {
    /** El cliente del remito no es el del pedido. No bloquea: avisa. */
    clienteDistinto: boolean
    orderClientName: string | null
    /** Las líneas del pedido con lo pendiente, para elegir qué cubre el remito. */
    delivery: DeliverableLine[]
    deliveryState: DeliveryState
}

/** De lo que se pega a un remito: la URL de Alegra, el id o el número. */
export async function resolveRemissionRef(ref: string): Promise<ExistingInvoice | null> {
    const limpio = ref.trim()
    if (!limpio) return null

    // Mismo cuidado que con la factura, al revés: la URL de una factura tiene la
    // misma forma, y tomarle el id sería buscar el remito equivocado.
    if (/alegra\.com\//i.test(limpio)) {
        const enUrl = limpio.match(/alegra\.com\/remission\/.*?\/id\/(\d+)/i)
        if (!enUrl) {
            throw new Error(
                "Esa URL de Alegra no es de un remito. Abrí el remito y copiá la dirección: tiene que decir /remission/.",
            )
        }
        return getRemission(Number(enUrl[1]))
    }

    if (/^\d+$/.test(limpio)) {
        return (await findRemissionByNumber(limpio)) ?? (await getRemission(Number(limpio)))
    }
    return findRemissionByNumber(limpio)
}

/** Qué remito es, si su cliente coincide y qué falta remitir. No escribe nada. */
export async function previewRemissionLink(orderId: number, ref: string): Promise<LinkedRemission> {
    const [order] = await sql`
        SELECT customer_external_id, customer_name FROM orders WHERE id = ${orderId}
    `
    if (!order) throw new Error("El pedido no existe")

    const remission = await resolveRemissionRef(ref)
    if (!remission) {
        throw new Error("No se encontró ese remito. Abrilo en Alegra y copiá la dirección del navegador.")
    }

    // El mismo papel dos veces en el mismo pedido duplicaría lo remitido. En OTRO
    // pedido sí se deja: un remito puede llevar la mercadería de varios pedidos.
    const [repetido] = await sql`
        SELECT 1 FROM order_remissions
        WHERE order_id = ${orderId} AND alegra_remission_id = ${remission.id}
        LIMIT 1
    `
    if (repetido) {
        throw new Error(`El remito ${remission.number ?? remission.id} ya está vinculado a este pedido.`)
    }

    const externalId = String(order.customer_external_id ?? "")
    const clientIdPedido = externalId.startsWith("alegra:") ? Number(externalId.slice(7)) : null
    const items = await deliverableItems(orderId)

    return {
        ...remission,
        clienteDistinto:
            clientIdPedido != null && remission.clientId != null && clientIdPedido !== remission.clientId,
        orderClientName: (order.customer_name as string) ?? null,
        delivery: toDeliverableLines(items),
        deliveryState: deliveryState(items),
    }
}

/**
 * Anota en el pedido un remito que ya existía en Alegra, cubriendo las cantidades
 * de `request` (null = todo lo pendiente).
 *
 * NO TOCA ALEGRA: el remito ya está emitido y dice lo que dice. Queda en el pedido
 * igual que uno emitido desde acá —con sus líneas, sumando a lo remitido—, así que
 * el resto de la app no tiene que saber de dónde salió.
 */
export async function linkExistingRemission(
    orderId: number,
    ref: string,
    request: DeliveryRequestItem[] | null,
    actor?: { name: string; email?: string | null },
): Promise<LinkedRemission> {
    const remission = await previewRemissionLink(orderId, ref)

    const items = await deliverableItems(orderId)
    const plan = planDelivery(items, request)
    if ("error" in plan) throw new Error(plan.error)

    // La fecha es la del papel, no la de hoy: la lista de remitos va en orden de
    // salida, y este salió cuando Alegra dice.
    const fecha = remission.date ? `${remission.date}T12:00:00Z` : null
    const [remito] = await sql`
        INSERT INTO order_remissions (
            order_id, alegra_remission_id, alegra_remission_number, remitted_at, actor_name, actor_email
        )
        VALUES (
            ${orderId}, ${remission.id}, ${remission.number},
            COALESCE(${fecha}::timestamptz, NOW()), ${actor?.name ?? null}, ${actor?.email ?? null}
        )
        RETURNING id
    `
    for (const linea of plan.items) {
        await sql`
            INSERT INTO order_remission_items (remission_id, order_item_id, product, quantity)
            VALUES (${remito.id}, ${linea.orderItemId}, ${linea.product}, ${linea.quantity})
        `
    }
    await refreshDeliveredQuantities(orderId)
    // Uno vinculado puede ser más viejo que los que ya había: el espejo se
    // recalcula en vez de pisarlo.
    await refreshRemissionMirror(orderId)

    const despues = await deliverableItems(orderId)
    return {
        ...remission,
        delivery: toDeliverableLines(despues),
        deliveryState: deliveryState(despues),
    }
}

/**
 * Las columnas de `orders` son el espejo del ÚLTIMO remito por fecha. Se
 * recalculan enteras: sin remitos quedan en NULL, que es "sin remitir".
 */
async function refreshRemissionMirror(orderId: number): Promise<void> {
    await sql`
        UPDATE orders o SET
            alegra_remission_id = r.alegra_remission_id,
            alegra_remission_number = r.alegra_remission_number,
            alegra_remitted_at = r.remitted_at,
            remission_synced_at = CASE WHEN r.alegra_remission_id IS NULL THEN NULL ELSE NOW() END,
            remission_warnings = COALESCE(r.warnings, '[]'::jsonb)
        FROM (SELECT 1) uno
        LEFT JOIN LATERAL (
            SELECT alegra_remission_id, alegra_remission_number, remitted_at, warnings
            FROM order_remissions WHERE order_id = ${orderId}
            ORDER BY remitted_at DESC, id DESC LIMIT 1
        ) r ON TRUE
        WHERE o.id = ${orderId}
    `
}

/**
 * Suelta un remito del pedido. NO TOCA ALEGRA: el documento sigue ahí, emitido.
 *
 * Sirve para lo que se vinculó por error, y también para uno emitido desde acá
 * que en Alegra se anuló: el pedido deja de contarlo y sus unidades vuelven a
 * pendientes. Si el papel sigue vivo en Alegra, anularlo es cosa de Alegra.
 */
export async function unlinkRemission(
    orderId: number,
    remissionId: number,
): Promise<{ number: string | null; delivery: DeliverableLine[] }> {
    const [borrado] = await sql`
        DELETE FROM order_remissions
        WHERE id = ${remissionId} AND order_id = ${orderId}
        RETURNING alegra_remission_number, alegra_remission_id
    `
    if (!borrado) throw new Error("Ese remito no está en este pedido.")

    await refreshDeliveredQuantities(orderId)
    await refreshRemissionMirror(orderId)

    const despues = await deliverableItems(orderId)
    return {
        number:
            (borrado.alegra_remission_number as string) ??
            (borrado.alegra_remission_id ? String(borrado.alegra_remission_id) : null),
        delivery: toDeliverableLines(despues),
    }
}
