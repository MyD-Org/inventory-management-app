import { sql } from "@/lib/database"
import { createInvoice, listNumberTemplates, type EstimateLine, type NumberTemplate } from "@/lib/alegra"
import { normalizeVariant } from "@/lib/alegra-sync"

// Facturar un pedido en Alegra.
//
// PREMISA: el catálogo es Alegra. Un producto existe porque está allá, con su
// precio; la hoja de costo es opcional y solo sirve para explotar materiales. Que
// falte no impide facturar.
//
// EL PEDIDO SEPARA, LA FACTURA COMBINA. El taller necesita leer "Optic 1" y el
// color en columnas distintas, así que la línea guarda el producto base y el color
// viaja en las specs. Alegra, en cambio, vende "Optic 1 12-24v / Azul" como un
// ítem propio. Acá se junta lo uno con lo otro.
//
// ES INSISTENTE A PROPÓSITO: si no encuentra el color exacto, factura el producto
// base y aclara el color en la descripción. Eso es seguro porque se verificó que
// las 48 familias con variantes tienen UN SOLO precio para todas: facturar el base
// cobra lo mismo. Lo único que se pierde es el detalle en el renglón.
//
// LO QUE NO HACE: inventar. Si el producto no está en el catálogo, esa línea NO se
// factura y queda avisado. Se emite la factura con lo que sí se pudo resolver, en
// vez de fallar entera o de meter un genérico que después nadie revisa.

export interface InvoiceLinePreview {
    /** Ítem de Alegra que se va a facturar. */
    alegraItemId: number
    name: string
    quantity: number
    price: number
    description: string
    /** Cómo se resolvió, para poder medir después qué hay que mejorar. */
    match: "variante" | "base" | "agregado"
}

export interface InvoicePreview {
    orderId: number
    clientId: number | null
    clientName: string | null
    lines: InvoiceLinePreview[]
    /** Qué quedó afuera y por qué. Vacío = la factura sale completa. */
    warnings: string[]
    total: number
    /** Numeración de Alegra que se va a usar. */
    numberTemplate: NumberTemplate | null
    /** Términos y condiciones de pago. */
    terms: string | null
    /** Notas adicionales de la factura. */
    notes: string | null
}

// Resuelve qué se facturaría, sin tocar Alegra. Es lo que consume el modo
// simulación y también el paso previo a emitir de verdad.
export async function previewInvoice(orderId: number): Promise<InvoicePreview> {
    const [order] = await sql`
        SELECT id, customer_external_id, customer_name, invoice_terms, invoice_notes
        FROM orders WHERE id = ${orderId}
    `
    if (!order) throw new Error("El pedido no existe")

    const items = await sql`
        SELECT id, line_no, product, specs, quantity, alegra_item_id
        FROM order_items WHERE order_id = ${orderId} ORDER BY line_no ASC
    `

    const lines: InvoiceLinePreview[] = []
    const warnings: string[] = []

    // El cliente del pedido viene como "alegra:1234" o "manual:nombre". Solo los
    // primeros se pueden facturar: los manuales no existen en la contabilidad.
    const externalId = String(order.customer_external_id ?? "")
    const clientId = externalId.startsWith("alegra:") ? Number(externalId.slice(7)) : null
    if (clientId == null) {
        warnings.push(`El cliente "${order.customer_name ?? externalId}" no está en Alegra: hay que darlo de alta antes de facturar.`)
    }

    for (const item of items as any[]) {
        const quantity = Number(item.quantity) || 0
        const specs = (item.specs ?? {}) as Record<string, string>

        if (item.alegra_item_id == null) {
            warnings.push(`"${item.product}" no está en el catálogo de Alegra: esa línea quedó sin facturar.`)
            continue
        }

        const [base] = await sql`
            SELECT alegra_id, base_name, base_normalized, price
            FROM alegra_items WHERE alegra_id = ${item.alegra_item_id}
        `
        if (!base) {
            warnings.push(`"${item.product}" ya no está en el espejo del catálogo: esa línea quedó sin facturar.`)
            continue
        }

        // El color puede o no existir como ítem propio. Si existe, gana.
        const color = specs.led_color?.trim()
        let elegido = base as any
        let match: InvoiceLinePreview["match"] = "base"

        if (color) {
            const [variante] = await sql`
                SELECT alegra_id, name, price FROM alegra_items
                WHERE base_normalized = ${base.base_normalized}
                  AND variant_normalized = ${normalizeVariant(color)}
                  AND status = 'active'
            `
            if (variante) {
                elegido = variante
                match = "variante"
            } else {
                const [{ count }] = await sql`
                    SELECT COUNT(*)::int AS count FROM alegra_items
                    WHERE base_normalized = ${base.base_normalized}
                      AND variant_label IS NOT NULL
                      AND status = 'active'
                `
                if (Number(count) > 0) {
                    warnings.push(`"${base.base_name}" en ${color} no existe como variante en Alegra: creá la variante para poder facturar esta línea.`)
                    continue
                }
                warnings.push(`"${base.base_name}" en ${color} no existe como producto en Alegra: se facturó el producto base y el color quedó aclarado en el renglón.`)
            }
        }

        // Agregados que se facturan aparte: la estaca no cambia el producto, suma
        // un renglón. El mapa vive en spec_option_items.
        const agregados: InvoiceLinePreview[] = []
        const specsConLineaPropia: string[] = []
        for (const [fieldKey, value] of Object.entries(specs)) {
            if (!value) continue
            const [addon] = await sql`
                SELECT s.alegra_item_id, s.qty_per_unit, i.name, i.price
                FROM spec_option_items s
                JOIN alegra_items i ON i.alegra_id = s.alegra_item_id
                WHERE s.field_key = ${fieldKey} AND s.spec_value = ${value}
            `
            if (!addon) continue
            specsConLineaPropia.push(fieldKey)
            agregados.push({
                alegraItemId: Number(addon.alegra_item_id),
                name: addon.name as string,
                quantity: Number(addon.qty_per_unit) * quantity,
                price: Number(addon.price) || 0,
                description: `${addon.name} — para ${item.product}`,
                match: "agregado",
            })
        }

        lines.push({
            alegraItemId: Number(elegido.alegra_id),
            name: (elegido.name ?? elegido.base_name) as string,
            quantity,
            price: Number(elegido.price) || 0,
            // Las specs que ya tienen su propio renglón (la estaca) no se repiten
            // acá: en la factura del cliente quedaría dicho dos veces.
            description: describeLine(specs, match === "base" ? color : null, specsConLineaPropia),
            match,
        })
        lines.push(...agregados)
    }

    if (lines.length === 0) {
        warnings.push("No se pudo resolver ninguna línea: no hay nada que facturar.")
    }

    const numberTemplate = clientId != null
        ? await resolveNumberTemplate((order.customer_name as string) ?? null)
        : undefined

    return {
        orderId,
        clientId,
        clientName: (order.customer_name as string) ?? null,
        lines,
        warnings,
        total: lines.reduce((s, l) => s + l.price * l.quantity, 0),
        numberTemplate: numberTemplate ?? null,
        terms: (order.invoice_terms as string | null) ?? null,
        notes: (order.invoice_notes as string | null) ?? null,
    }
}

// Qué dice el renglón de la factura. No repite el nombre del ítem ni el color de
// LED (que ya figura en el nombre cuando se encontró la variante). Solo aclara
// el color suelto cuando no existía la variante en Alegra.
function describeLine(
    specs: Record<string, string>,
    colorSuelto: string | null,
    excluir: string[] = [],
): string {
    const fuera = new Set([...excluir, "led_color"])
    const partes = Object.entries(specs)
        .filter(([k, v]) => v && v !== "sin" && !fuera.has(k))
        .map(([k, v]) => formatSpec(k, v))
    const detalle = partes.join(" · ")
    return colorSuelto ? `${detalle} (color ${colorSuelto})` : detalle
}

function formatSpec(key: string, value: string): string {
    switch (key) {
        case "clamp":
            return `grampa ${value}`
        case "body_color":
            return `equipo color ${value}`
        case "optic":
            return `óptica ${value}°`
        default:
            return value
    }
}

function normalizeName(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

// Elige la numeración de factura en Alegra. Si el cliente tiene una numeración
// propia cuyo nombre coincide con su nombre, la usa; si no, usa la numeración
// "Principal"; si tampoco existe, cae en la primera disponible.
export async function resolveNumberTemplate(clientName: string | null): Promise<NumberTemplate | undefined> {
    const templates = await listNumberTemplates()
    if (templates.length === 0) return undefined

    if (clientName) {
        const target = normalizeName(clientName)
        const byClient = templates.find((t) => normalizeName(t.name) === target)
        if (byClient) return byClient
    }

    const principal = templates.find((t) => normalizeName(t.name) === "principal")
    if (principal) return principal

    return templates[0]
}

export interface InvoiceResult extends InvoicePreview {
    invoiceId: number | null
    invoiceNumber: string | null
    invoiceUrl: string | null
    /** true = no se emitió nada, solo se calculó. */
    dryRun: boolean
}

// Emite la factura. Con dryRun devuelve exactamente lo mismo sin tocar Alegra:
// es la única forma de probar esto contra pedidos reales sin ensuciar la
// contabilidad.
//
// IDEMPOTENTE: si el pedido ya tiene factura, no crea otra.
export async function invoiceOrder(
    orderId: number,
    opts: { dryRun?: boolean; terms?: string; notes?: string } = {},
): Promise<InvoiceResult> {
    const dryRun = opts.dryRun ?? false
    const terms = opts.terms?.trim() || null
    const notes = opts.notes?.trim() || null

    const [existing] = await sql`
        SELECT alegra_invoice_id, alegra_invoice_number FROM orders WHERE id = ${orderId}
    `
    if (existing?.alegra_invoice_id) {
        const preview = await previewInvoice(orderId)
        return {
            ...preview,
            warnings: [...preview.warnings, "El pedido ya tenía factura: no se emitió otra."],
            invoiceId: Number(existing.alegra_invoice_id),
            invoiceNumber: (existing.alegra_invoice_number as string) ?? null,
            invoiceUrl: `https://app.alegra.com/invoice/view/id/${existing.alegra_invoice_id}`,
            dryRun,
        }
    }

    const preview = await previewInvoice(orderId)

    // Sin cliente de Alegra o sin líneas resueltas no hay factura posible.
    if (dryRun || preview.clientId == null || preview.lines.length === 0) {
        return { ...preview, invoiceId: null, invoiceNumber: null, invoiceUrl: null, dryRun: true }
    }

    const lineas: EstimateLine[] = preview.lines.map((l) => ({
        id: l.alegraItemId,
        description: l.description,
        price: l.price,
        quantity: l.quantity,
    }))

    const numberTemplate = await resolveNumberTemplate(preview.clientName)

    const creada = await createInvoice({
        clientId: preview.clientId,
        lines: lineas,
        observations: `Pedido #${orderId}`,
        numberTemplateId: numberTemplate?.id,
        terms,
        invoiceNotes: notes,
    })

    await sql`
        UPDATE orders SET
            alegra_invoice_id = ${creada.id},
            alegra_invoice_number = ${creada.number},
            alegra_invoiced_at = NOW(),
            invoice_warnings = ${JSON.stringify(preview.warnings)}::jsonb,
            invoice_terms = ${terms},
            invoice_notes = ${notes}
        WHERE id = ${orderId}
    `

    return {
        ...preview,
        invoiceId: creada.id,
        invoiceNumber: creada.number,
        invoiceUrl: creada.url,
        dryRun: false,
    }
}
