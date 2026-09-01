import { sql } from "@/lib/database"
import { createRemission, updateRemission, type EstimateLine } from "@/lib/alegra"
import { previewInvoice, type InvoicePreview } from "@/lib/invoicing"

// Remito del pedido en Alegra: qué mercadería sale del depósito.
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
// después, a veces al revés. Ninguno espera al otro.

export interface RemissionResult {
    orderId: number
    clientId: number | null
    clientName: string | null
    lines: Array<{ alegraItemId: number; name: string; quantity: number; description: string }>
    warnings: string[]
    remissionId: number | null
    remissionNumber: string | null
    remissionUrl: string | null
    /** true = solo se calculó, no se emitió nada. */
    dryRun: boolean
}

/** Las líneas del remito, sin importes. Salen de la misma resolución que la factura. */
function toRemissionLines(preview: InvoicePreview) {
    return preview.lines.map((l) => ({
        alegraItemId: l.alegraItemId,
        name: l.name,
        quantity: l.quantity,
        description: l.description,
    }))
}

/** Qué diría el remito si se emitiera ahora. No toca Alegra. */
export async function previewRemission(orderId: number): Promise<RemissionResult> {
    const preview = await previewInvoice(orderId)
    const [existing] = await sql`
        SELECT alegra_remission_id, alegra_remission_number FROM orders WHERE id = ${orderId}
    `
    return {
        orderId,
        clientId: preview.clientId,
        clientName: preview.clientName,
        lines: toRemissionLines(preview),
        warnings: preview.warnings,
        remissionId: existing?.alegra_remission_id ? Number(existing.alegra_remission_id) : null,
        remissionNumber: (existing?.alegra_remission_number as string) ?? null,
        remissionUrl: existing?.alegra_remission_id
            ? `https://app.alegra.com/remission/view/id/${existing.alegra_remission_id}`
            : null,
        dryRun: true,
    }
}

/**
 * Emite el remito del pedido.
 *
 * IDEMPOTENTE, igual que invoiceOrder: si el pedido ya tiene remito, no crea otro.
 * Emitir dos remitos del mismo pedido significa que la mercadería salió dos veces.
 */
export async function remitOrder(orderId: number): Promise<RemissionResult> {
    const [existing] = await sql`
        SELECT alegra_remission_id, alegra_remission_number, alegra_invoice_number
        FROM orders WHERE id = ${orderId}
    `
    if (!existing) throw new Error("El pedido no existe")

    const preview = await previewInvoice(orderId)
    const base = {
        orderId,
        clientId: preview.clientId,
        clientName: preview.clientName,
        lines: toRemissionLines(preview),
    }

    if (existing.alegra_remission_id) {
        return {
            ...base,
            warnings: [...preview.warnings, "El pedido ya tenía remito: no se emitió otro."],
            remissionId: Number(existing.alegra_remission_id),
            remissionNumber: (existing.alegra_remission_number as string) ?? null,
            remissionUrl: `https://app.alegra.com/remission/view/id/${existing.alegra_remission_id}`,
            dryRun: false,
        }
    }

    if (preview.clientId == null) {
        throw new Error("El pedido no tiene cliente de Alegra: no se puede emitir el remito.")
    }
    if (preview.lines.length === 0) {
        throw new Error("Ninguna línea del pedido se pudo resolver contra el catálogo de Alegra.")
    }

    const lineas: EstimateLine[] = preview.lines.map((l) => ({
        id: l.alegraItemId,
        description: l.description,
        // Ver arriba: el remito no lleva plata.
        price: 0,
        quantity: l.quantity,
    }))

    // Alegra no relaciona un remito con una factura ya emitida —no existe el campo—,
    // así que el vínculo se deja escrito. Es lo que va a leer quien abra el
    // documento en Alegra sin tener el pedido a mano.
    const observations = existing.alegra_invoice_number
        ? `Pedido #${orderId} · Factura ${existing.alegra_invoice_number}`
        : `Pedido #${orderId}`

    const creado = await createRemission({
        clientId: preview.clientId,
        lines: lineas,
        observations,
    })

    await sql`
        UPDATE orders SET
            alegra_remission_id = ${creado.id},
            alegra_remission_number = ${creado.number},
            alegra_remitted_at = NOW(),
            remission_synced_at = NOW(),
            remission_warnings = ${JSON.stringify(preview.warnings)}::jsonb
        WHERE id = ${orderId}
    `

    return {
        ...base,
        warnings: preview.warnings,
        remissionId: creado.id,
        remissionNumber: creado.number,
        remissionUrl: creado.url,
        dryRun: false,
    }
}

/**
 * Poner al día el remito de un pedido que cambió después de emitirse.
 *
 * Espejo exacto de updateOrderInvoice: edita el MISMO remito, no emite otro, y es
 * manual a propósito. Lo único distinto es que acá no hay importes que recalcular.
 */
export async function updateOrderRemission(orderId: number): Promise<RemissionResult> {
    const [existing] = await sql`
        SELECT alegra_remission_id, alegra_remission_number, alegra_invoice_number
        FROM orders WHERE id = ${orderId}
    `
    if (!existing?.alegra_remission_id) {
        throw new Error("El pedido no tiene remito emitido: no hay nada que actualizar.")
    }

    const preview = await previewInvoice(orderId)
    if (preview.lines.length === 0) {
        throw new Error("El pedido no tiene ninguna línea remitible: el remito no se tocó.")
    }

    const lineas: EstimateLine[] = preview.lines.map((l) => ({
        id: l.alegraItemId,
        description: l.description,
        price: 0,
        quantity: l.quantity,
    }))

    const actualizado = await updateRemission(Number(existing.alegra_remission_id), {
        lines: lineas,
        // La referencia a la factura se rehace acá: puede haberse emitido después
        // del remito, y en ese caso el remito todavía no la nombraba.
        observations: existing.alegra_invoice_number
            ? `Pedido #${orderId} · Factura ${existing.alegra_invoice_number}`
            : `Pedido #${orderId}`,
    })

    // Recién con Alegra confirmando se baja la bandera.
    await sql`
        UPDATE orders SET
            remission_warnings = ${JSON.stringify(preview.warnings)}::jsonb,
            remission_stale = FALSE,
            remission_synced_at = NOW()
        WHERE id = ${orderId}
    `

    return {
        orderId,
        clientId: preview.clientId,
        clientName: preview.clientName,
        lines: toRemissionLines(preview),
        warnings: preview.warnings,
        remissionId: actualizado.id,
        remissionNumber: actualizado.number ?? ((existing.alegra_remission_number as string) ?? null),
        remissionUrl: actualizado.url,
        dryRun: false,
    }
}
