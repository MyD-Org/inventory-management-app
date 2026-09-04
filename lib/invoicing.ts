import { sql } from "@/lib/database"
import {
    createInvoice,
    findInvoiceByNumber,
    getInvoice,
    listNumberTemplates,
    updateInvoice,
    type EstimateLine,
    type ExistingInvoice,
    type NumberTemplate,
} from "@/lib/alegra"
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
    /** Todas las numeraciones disponibles, para poder elegir otra antes de emitir. */
    numberTemplates: NumberTemplate[]
    /** Términos y condiciones de pago. */
    terms: string | null
    /** Notas adicionales de la factura. */
    notes: string | null
}

// "Blanco Frio 6000" → "blanco frio". Devuelve null si el color no termina en
// una temperatura, así no se busca dos veces lo mismo.
function variantWithoutTemperature(color: string): string | null {
    const n = normalizeVariant(color)
    if (!n) return null
    const sin = n.replace(/\s*\d{3,5}\s*$/, "").trim()
    return sin && sin !== n ? sin : null
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

        // Cuando la variante se encontró por el color sin la temperatura, el
        // renglón tiene que aclarar la temperatura pedida igual que en el caso base.
        let colorEnDescripcion = false

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
                // El pedido pide "Blanco Frio 6000" y en Alegra la variante está
                // cargada como "Blanco Frio" a secas. Es el mismo color y el mismo
                // precio (todas las variantes de una familia valen igual), así que
                // se factura esa y la temperatura queda escrita en el renglón.
                const colorSinTemperatura = variantWithoutTemperature(color)
                const [porColor] = colorSinTemperatura
                    ? await sql`
                        SELECT alegra_id, name, price FROM alegra_items
                        WHERE base_normalized = ${base.base_normalized}
                          AND variant_normalized = ${colorSinTemperatura}
                          AND status = 'active'
                    `
                    : [undefined]
                if (porColor) {
                    elegido = porColor
                    match = "variante"
                    colorEnDescripcion = true
                }
            }

            if (match === "base") {
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
            description: describeLine(specs, match === "base" || colorEnDescripcion ? color : null, specsConLineaPropia),
            match,
        })
        lines.push(...agregados)
    }

    // Si ya hay avisos, cada uno explica por qué su línea quedó afuera: repetir
    // "no hay nada que facturar" no agrega información. Solo hace falta cuando el
    // pedido no dejó ningún aviso (por ejemplo, un pedido sin líneas).
    if (lines.length === 0 && warnings.length === 0) {
        warnings.push("No se pudo resolver ninguna línea: no hay nada que facturar.")
    }

    // Se traen todas y se elige una acá mismo: la pantalla muestra la sugerida y
    // deja cambiarla, así que la lista completa viaja igual.
    const numberTemplates = clientId != null ? await listNumberTemplates() : []
    const numberTemplate = pickNumberTemplate(numberTemplates, (order.customer_name as string) ?? null)

    return {
        orderId,
        clientId,
        clientName: (order.customer_name as string) ?? null,
        lines,
        warnings,
        total: lines.reduce((s, l) => s + l.price * l.quantity, 0),
        numberTemplate: numberTemplate ?? null,
        numberTemplates,
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
    if (!colorSuelto) return detalle
    // Sin otras specs no hay nada que aclarar entre paréntesis: el color es el
    // renglón entero.
    return detalle ? `${detalle} (color ${colorSuelto})` : `color ${colorSuelto}`
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
    return pickNumberTemplate(await listNumberTemplates(), clientName)
}

// La misma decisión, sobre una lista ya traída. Existe aparte porque la
// simulación necesita la lista entera (para poder elegir otra) y pedirla dos
// veces es un viaje de más a Alegra.
export function pickNumberTemplate(
    templates: NumberTemplate[],
    clientName: string | null,
): NumberTemplate | undefined {
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
    opts: { dryRun?: boolean; terms?: string; notes?: string; numberTemplateId?: number } = {},
): Promise<InvoiceResult> {
    const dryRun = opts.dryRun ?? false
    const terms = opts.terms?.trim() || null
    const notes = opts.notes?.trim() || null

    const [existing] = await sql`
        SELECT alegra_invoice_id, alegra_invoice_number, alegra_remission_number
        FROM orders WHERE id = ${orderId}
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

    // La numeración elegida en la pantalla gana; si no vino ninguna, la sugerida.
    const numberTemplate =
        (opts.numberTemplateId != null
            ? preview.numberTemplates.find((t) => t.id === opts.numberTemplateId)
            : undefined) ?? preview.numberTemplate ?? undefined

    // Si el pedido ya se remitió, la factura lo nombra. Alegra tiene una relación
    // nativa (POST /invoices con "remissions": [id]) que acá NO se usa: toma las
    // líneas del remito tal cual, y como el remito va en cero la factura saldría
    // en cero. Entre el vínculo automático y que la plata esté bien, gana la plata.
    const observations = existing?.alegra_remission_number
        ? `Pedido #${orderId} · Remito ${existing.alegra_remission_number}`
        : `Pedido #${orderId}`

    const creada = await createInvoice({
        clientId: preview.clientId,
        lines: lineas,
        observations,
        numberTemplateId: numberTemplate?.id,
        terms,
        invoiceNotes: notes,
    })

    await sql`
        UPDATE orders SET
            alegra_invoice_id = ${creada.id},
            alegra_invoice_number = ${creada.number},
            alegra_invoiced_at = NOW(),
            invoice_synced_at = NOW(),
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


// Poner al día la factura de un pedido que cambió después de emitirse.
//
// NO EMITE UNA SEGUNDA FACTURA: edita la misma, con las líneas recalculadas desde
// el estado actual del pedido. El número no cambia.
//
// ES MANUAL A PROPÓSITO. Se decidió no dispararlo solo al editar un ítem: escribir
// en la contabilidad de fondo, sin que nadie lo pida, es la clase de cosa que se
// descubre tarde y mal. El pedido queda marcado (invoice_stale) y alguien aprieta
// el botón cuando terminó de corregir, no en cada tecla.
export async function updateOrderInvoice(orderId: number): Promise<InvoiceResult> {
    const [existing] = await sql`
        SELECT alegra_invoice_id, alegra_invoice_number, invoice_terms, invoice_notes
        FROM orders WHERE id = ${orderId}
    `
    if (!existing?.alegra_invoice_id) {
        throw new Error("El pedido no tiene factura emitida: no hay nada que actualizar.")
    }

    const preview = await previewInvoice(orderId)

    // Vaciar una factura no es una actualización, es un error de otra cosa. Se para
    // acá antes de mandarle a Alegra una factura sin renglones.
    if (preview.lines.length === 0) {
        throw new Error("El pedido no tiene ninguna línea facturable: la factura no se tocó.")
    }

    const lineas: EstimateLine[] = preview.lines.map((l) => ({
        id: l.alegraItemId,
        description: l.description,
        price: l.price,
        quantity: l.quantity,
    }))

    const actualizada = await updateInvoice(Number(existing.alegra_invoice_id), {
        lines: lineas,
        terms: (existing.invoice_terms as string | null) ?? null,
        invoiceNotes: (existing.invoice_notes as string | null) ?? null,
    })

    // Recién con Alegra confirmando se baja la bandera: si el PUT falla, el pedido
    // tiene que seguir avisando que la factura está desactualizada.
    await sql`
        UPDATE orders SET
            invoice_warnings = ${JSON.stringify(preview.warnings)}::jsonb,
            invoice_stale = FALSE,
            invoice_synced_at = NOW()
        WHERE id = ${orderId}
    `

    return {
        ...preview,
        invoiceId: actualizada.id,
        invoiceNumber: actualizada.number ?? ((existing.alegra_invoice_number as string) ?? null),
        invoiceUrl: actualizada.url,
        dryRun: false,
    }
}

// ── Vincular una factura que YA estaba en Alegra ─────────────────────────────
//
// Pasa seguido: la factura se hizo en Alegra antes de que el pedido existiera en
// la app. Emitir otra sería facturarle dos veces al cliente, así que lo que hace
// falta no es emitir sino apuntar a la que ya está.

export interface LinkedInvoice extends ExistingInvoice {
    /** El cliente de la factura no es el del pedido. No bloquea: avisa. */
    clienteDistinto: boolean
    /** Nombre del cliente del pedido, para poder contar la diferencia. */
    orderClientName: string | null
}

/**
 * De lo que se pega a una factura concreta. Acepta las tres formas en que alguien
 * tiene la factura a mano:
 *   - la URL de Alegra   https://app.alegra.com/invoice/view/id/2618
 *   - el id              2618
 *   - el número          1612, L533, G-430
 *
 * La URL es la vía directa —el id está en la barra de direcciones— y la única que
 * sirve para una factura vieja: el número se busca recorriendo las más recientes.
 */
export async function resolveInvoiceRef(ref: string): Promise<ExistingInvoice | null> {
    const limpio = ref.trim()
    if (!limpio) return null

    // URL de Alegra: .../invoice/view/id/2618 (con o sin barra o query al final).
    //
    // SOLO facturas: la URL de un remito —/remission/view/id/1027— tiene la misma
    // forma, y tomarle el id llevaría a buscar la factura 1027, que es otro
    // documento y probablemente exista. Se falla con un mensaje en vez de vincular
    // en silencio la equivocada.
    const esUrlDeAlegra = /alegra\.com\//i.test(limpio)
    if (esUrlDeAlegra) {
        const enUrl = limpio.match(/alegra\.com\/invoice\/.*?\/id\/(\d+)/i)
        if (!enUrl) {
            throw new Error(
                "Esa URL de Alegra no es de una factura. Abrí la factura y copiá la dirección: tiene que decir /invoice/.",
            )
        }
        return getInvoice(Number(enUrl[1]))
    }

    // Un número pelado es ambiguo: puede ser el id o el número de la factura. Se
    // prueba primero como número —es lo que la gente tiene a mano, lo que está
    // impreso— y recién si no aparece se prueba como id.
    if (/^\d+$/.test(limpio)) {
        return (await findInvoiceByNumber(limpio)) ?? (await getInvoice(Number(limpio)))
    }

    // Con prefijo (L533, G-430) solo puede ser un número.
    return findInvoiceByNumber(limpio)
}

/** Qué factura es y si su cliente coincide con el del pedido. No escribe nada. */
export async function previewInvoiceLink(orderId: number, ref: string): Promise<LinkedInvoice> {
    const [order] = await sql`
        SELECT customer_external_id, customer_name, alegra_invoice_id, alegra_invoice_number
        FROM orders WHERE id = ${orderId}
    `
    if (!order) throw new Error("El pedido no existe")
    if (order.alegra_invoice_id) {
        throw new Error(
            `El pedido ya tiene la factura ${order.alegra_invoice_number ?? order.alegra_invoice_id}. Desvinculala antes de apuntar a otra.`,
        )
    }

    const invoice = await resolveInvoiceRef(ref)
    if (!invoice) {
        throw new Error(
            "No se encontró esa factura. Abrila en Alegra y copiá la dirección del navegador.",
        )
    }

    const externalId = String(order.customer_external_id ?? "")
    const clientIdPedido = externalId.startsWith("alegra:") ? Number(externalId.slice(7)) : null

    return {
        ...invoice,
        // Solo se compara cuando el pedido tiene cliente de Alegra: si es un cliente
        // de mostrador no hay con qué comparar y no se afirma nada.
        clienteDistinto:
            clientIdPedido != null && invoice.clientId != null && clientIdPedido !== invoice.clientId,
        orderClientName: (order.customer_name as string) ?? null,
    }
}

/**
 * Apunta el pedido a una factura que ya existía en Alegra.
 *
 * NO EMITE NADA y no toca la factura: solo guarda a cuál apunta este pedido. La
 * factura se hizo antes y con su propio criterio —puede tener otras líneas, otro
 * precio, varios pedidos adentro— y reescribirla para que coincida con el pedido
 * sería romper algo que ya estaba bien.
 *
 * Por eso queda SINCRONIZADA al vincular (invoice_stale = FALSE): decir que está
 * desactualizada respecto de un pedido que ni existía cuando se emitió no aporta
 * nada. Los cambios que vengan DESPUÉS sí la marcan, como con cualquier otra.
 */
export async function linkExistingInvoice(orderId: number, ref: string): Promise<LinkedInvoice> {
    const invoice = await previewInvoiceLink(orderId, ref)

    await sql`
        UPDATE orders SET
            alegra_invoice_id = ${invoice.id},
            alegra_invoice_number = ${invoice.number},
            alegra_invoiced_at = ${invoice.date ? `${invoice.date}T00:00:00Z` : null},
            invoice_synced_at = NOW(),
            invoice_stale = FALSE,
            invoice_warnings = '[]'::jsonb
        WHERE id = ${orderId}
    `

    return invoice
}

/** Suelta la factura del pedido. No toca nada en Alegra: la factura sigue ahí. */
export async function unlinkInvoice(orderId: number): Promise<void> {
    await sql`
        UPDATE orders SET
            alegra_invoice_id = NULL,
            alegra_invoice_number = NULL,
            alegra_invoiced_at = NULL,
            invoice_synced_at = NULL,
            invoice_stale = FALSE
        WHERE id = ${orderId}
    `
}
