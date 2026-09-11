import { sql } from "@/lib/database"
import { createRemission, type EstimateLine } from "@/lib/alegra"
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
