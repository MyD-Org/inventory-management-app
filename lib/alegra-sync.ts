import { sql } from "@/lib/database"
import { listAllContacts, listAllItems, listInvoicesSince, listOpenInvoices, listPaymentsSince } from "@/lib/alegra"

// Sync del espejo de Alegra contra la API.
//
// Hasta ahora alegra_clients se llenaba con exports CSV cargados a mano
// (lib/alegra-import.ts). El resultado medido el 2026-08-24: 42 clientes
// espejados contra 110 en Alegra, y un mes de atraso en las facturas. Como
// searchCustomers() y las tools de IA leen del espejo, dos de cada tres clientes
// no aparecían al cargar un pedido.
//
// El espejo NO se elimina a favor de consultar Alegra en vivo, a propósito:
//   - Los reportes agregan sobre miles de documentos; por la API, que pagina de
//     a 30 y tarda ~1s por request, un solo reporte serían minutos y volaría el
//     rate limit (100/min en contactos, 150/min en el resto).
//   - Durante un mes /items devolvió 402 por el plan de la cuenta. Con todo en
//     vivo la app habría estado rota; el espejo la mantuvo funcionando.
// Lo que cambia es cómo se llena: API en vez de CSV.

export interface SyncResult {
    fetched: number
    inserted: number
    updated: number
    skipped: number
    /**
     * Contactos que comparten nombre con otro ya espejado. El espejo tiene
     * name_normalized UNIQUE (de cuando el CSV solo traía el nombre), así que no
     * puede representar dos clientes que se llamen igual. Se conserva el primero
     * y se listan acá los otros, en vez de pisar un alegra_id sin avisar: son
     * duplicados en Alegra que conviene unificar allá.
     */
    duplicates: Array<{ alegra_id: number; name: string; kept_alegra_id: number | null }>
}

function normalizeName(s: string | undefined): string {
    return (s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

// Trae los contactos de Alegra y los vuelca en alegra_clients.
//
// El match es en dos pasos porque las filas tienen dos orígenes posibles: las
// que vinieron por API tienen alegra_id, y las que vinieron del CSV solo tienen
// el nombre. Primero se busca por alegra_id (sobrevive a que renombren al
// cliente en Alegra) y recién si no aparece se cae al nombre normalizado, que es
// lo que adopta las filas viejas del CSV en vez de duplicarlas.
//
// NO borra nada: un cliente que ya no esté en Alegra queda en el espejo, porque
// puede tener facturas históricas que lo referencian.
export async function syncContacts(): Promise<SyncResult> {
    const contacts = await listAllContacts()
    const result: SyncResult = { fetched: contacts.length, inserted: 0, updated: 0, skipped: 0, duplicates: [] }

    for (const c of contacts) {
        const norm = normalizeName(c.name)
        if (!norm) {
            result.skipped++
            continue
        }

        const byId = await sql`
            UPDATE alegra_clients SET
                name = ${c.name},
                name_normalized = ${norm},
                identification = COALESCE(${c.identification}, identification),
                email = COALESCE(${c.email}, email),
                phone = COALESCE(${c.phone}, phone),
                address = COALESCE(${c.address}, address),
                city = COALESCE(${c.city}, city),
                updated_at = NOW()
            WHERE alegra_id = ${c.id}
            RETURNING id
        `
        if (byId.length > 0) {
            result.updated++
            continue
        }

        // Sin alegra_id: o es nuevo, o es una fila del CSV que hay que adoptar,
        // o hay otro contacto de Alegra que se llama igual. Ese último caso no lo
        // puede representar el espejo, así que se reporta y no se toca la fila.
        const [existing] = await sql`
            SELECT alegra_id FROM alegra_clients WHERE name_normalized = ${norm}
        `
        if (existing && existing.alegra_id != null && Number(existing.alegra_id) !== c.id) {
            result.duplicates.push({ alegra_id: c.id, name: c.name, kept_alegra_id: Number(existing.alegra_id) })
            continue
        }

        // COALESCE en el UPDATE para no pisar con NULL lo que el CSV ya tenía.
        const upsert = await sql`
            INSERT INTO alegra_clients (alegra_id, name, name_normalized, identification, email, phone, address, city)
            VALUES (${c.id}, ${c.name}, ${norm}, ${c.identification}, ${c.email}, ${c.phone}, ${c.address}, ${c.city})
            ON CONFLICT (name_normalized) DO UPDATE SET
                alegra_id = EXCLUDED.alegra_id,
                identification = COALESCE(EXCLUDED.identification, alegra_clients.identification),
                email = COALESCE(EXCLUDED.email, alegra_clients.email),
                phone = COALESCE(EXCLUDED.phone, alegra_clients.phone),
                address = COALESCE(EXCLUDED.address, alegra_clients.address),
                city = COALESCE(EXCLUDED.city, alegra_clients.city),
                updated_at = NOW()
            RETURNING (xmax = 0) AS is_insert
        `
        if (upsert[0]?.is_insert) result.inserted++
        else result.updated++
    }

    return result
}

// ── Documentos de venta y pagos ──────────────────────────────────────────────

// Alegra devuelve 'open' | 'closed' | 'void'; el espejo tiene 2622 filas cargadas
// desde los CSV, que usan el vocabulario en castellano. Traducimos para no partir
// la tabla en dos idiomas: hay queries de dashboards y tools de IA que filtran
// por estos valores.
const STATUS_ES: Record<string, string> = {
    closed: "Cobrada",
    open: "Por cobrar",
    void: "Anulada",
}

// Desde cuándo pedirle documentos a Alegra.
//
// Se toma la fecha más reciente del espejo y se restan 7 días de margen: un
// documento puede editarse o pagarse después de emitido, y así lo volvemos a
// traer. IGNORA fechas futuras: en esta cuenta hay un pago tipeado con año 3023,
// y si el cursor se guiara por él el sync no traería nunca más nada.
async function cursorSince(table: "alegra_sales_documents" | "alegra_payments", column: "issue_date" | "payment_date"): Promise<string> {
    const rows = table === "alegra_sales_documents"
        ? await sql`SELECT MAX(issue_date)::text AS d FROM alegra_sales_documents WHERE issue_date <= CURRENT_DATE`
        : await sql`SELECT MAX(payment_date)::text AS d FROM alegra_payments WHERE payment_date <= CURRENT_DATE`
    const last = rows[0]?.d as string | null
    if (!last) return "2000-01-01" // espejo vacío: backfill completo
    const d = new Date(last + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().slice(0, 10)
}

export interface DocSyncResult {
    since: string
    fetched: number
    upserted: number
    items: number
    skipped: number
}

// Facturas + sus líneas. Las líneas se borran y reinsertan por documento, igual
// que hace el importador de CSV: es más simple que diffear y el volumen por
// documento es de unas pocas filas.
//
// NO cubre notas de crédito ni de débito: viven en otro endpoint (/credit-notes)
// y las 31 que hay en el espejo siguen viniendo del CSV. Queda pendiente.
export interface ReceivablesSyncResult {
    fetched: number
    inserted: number
    /** Facturas abiertas cuyo cliente no está espejado: quedan con client_id NULL y
     *  por lo tanto FUERA del balance por cliente. Debería ser siempre 0 porque
     *  syncContacts() corre antes; si no lo es, hay un contacto sin espejar. */
    orphans: number
    debtors: number
    outstanding: number
}

// Cuentas por cobrar desde la API. Reemplazó al import manual del Excel, que ya fue
// eliminado del importador (lib/alegra-import.ts): era la única parte del espejo
// que no se refrescaba sola y por eso envejecía sin que nadie se enterara:
// medido el 2026-09-02, la foto cargada tenía 47 días y declaraba $36.269.592
// contra los $52.043.815 reales — el mayor deudor ni figuraba.
//
// Sigue siendo una FOTO (DELETE + INSERT), igual que el Excel: una factura que se
// cobra desaparece de /invoices?status=open, así que actualizar en vez de reemplazar
// dejaría saldos fantasma. Por eso también hay que refrescar la MV al final.
//
// Corre DESPUÉS de syncContacts(): el cliente se matchea por alegra_id.
export async function syncReceivables(): Promise<ReceivablesSyncResult> {
    const invoices = await listOpenInvoices()
    const result: ReceivablesSyncResult = {
        fetched: invoices.length, inserted: 0, orphans: 0, debtors: 0, outstanding: 0,
    }

    // Mapa alegra_id → id local, de una sola query: son ~240 facturas y hacer un
    // SELECT por cada una multiplicaría el tiempo del sync sin motivo.
    const rows = await sql`SELECT id, alegra_id, name FROM alegra_clients WHERE alegra_id IS NOT NULL`
    const byAlegraId = new Map<number, { id: number; name: string }>(
        rows.map((r: any) => [Number(r.alegra_id), { id: r.id, name: r.name }]),
    )

    const perClient = new Map<number, number>()

    await sql`DELETE FROM alegra_receivables`
    for (const inv of invoices) {
        const code = inv.numberTemplate?.fullNumber ?? inv.number ?? null
        if (!code) continue

        const alegraClientId = inv.client?.id != null ? Number(inv.client.id) : null
        const local = alegraClientId != null ? byAlegraId.get(alegraClientId) : undefined
        if (!local) result.orphans++

        const clientName = local?.name ?? inv.client?.name ?? null
        const outstanding = Number(inv.balance) || 0

        await sql`
            INSERT INTO alegra_receivables
                (code, doc_label, client_id, client_name, client_name_normalized,
                 total, collected, outstanding, issue_date, due_date, source_file)
            VALUES (${code}, 'Factura', ${local?.id ?? null},
                    ${clientName}, ${normalizeName(clientName ?? undefined)},
                    ${Number(inv.total) || 0}, ${Number(inv.totalPaid) || 0}, ${outstanding},
                    ${inv.date || null}, ${inv.dueDate || null}, 'api')
        `
        result.inserted++
        result.outstanding += outstanding
        if (local) perClient.set(local.id, (perClient.get(local.id) ?? 0) + outstanding)
    }

    result.outstanding = Math.round(result.outstanding * 100) / 100
    result.debtors = [...perClient.values()].filter((v) => v > 0).length

    // Sin esto el balance por cliente queda en la foto anterior. CONCURRENTLY para no
    // bloquear las lecturas de las tools mientras se refresca (requiere el índice único).
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY alegra_client_balances`

    return result
}

export async function syncInvoices(sinceOverride?: string): Promise<DocSyncResult> {
    const since = sinceOverride || (await cursorSince("alegra_sales_documents", "issue_date"))
    const invoices = await listInvoicesSince(since)
    const result: DocSyncResult = { since, fetched: invoices.length, upserted: 0, items: 0, skipped: 0 }

    for (const inv of invoices) {
        const code = inv.numberTemplate?.fullNumber ?? inv.number ?? null
        if (!code || !inv.date) {
            result.skipped++
            continue
        }

        // El cliente se matchea por alegra_id, no por nombre: es estable aunque lo
        // renombren, y ahora que syncContacts() llena esa columna está disponible.
        const clientAlegraId = inv.client?.id != null ? Number(inv.client.id) : null
        const [client] = clientAlegraId
            ? await sql`SELECT id FROM alegra_clients WHERE alegra_id = ${clientAlegraId}`
            : [undefined]

        const [doc] = await sql`
            INSERT INTO alegra_sales_documents (
                doc_type, code, issue_date, due_date, status, client_id, client_name,
                seller, warehouse, payment_term, notes, subtotal, total, paid_amount, source_file
            )
            VALUES (
                'invoice', ${code}, ${inv.date}, ${inv.dueDate || null},
                ${STATUS_ES[inv.status] ?? inv.status ?? null},
                ${client?.id ?? null}, ${inv.client?.name ?? null},
                ${inv.seller?.name ?? null}, ${inv.warehouse?.name ?? null},
                ${inv.term?.name ?? null}, ${inv.observations || null},
                ${Number(inv.subtotal) || 0}, ${Number(inv.total) || 0},
                ${Number(inv.totalPaid) || 0}, 'api'
            )
            ON CONFLICT (doc_type, code) DO UPDATE SET
                issue_date = EXCLUDED.issue_date,
                due_date = EXCLUDED.due_date,
                status = EXCLUDED.status,
                client_id = COALESCE(EXCLUDED.client_id, alegra_sales_documents.client_id),
                client_name = COALESCE(EXCLUDED.client_name, alegra_sales_documents.client_name),
                seller = COALESCE(EXCLUDED.seller, alegra_sales_documents.seller),
                subtotal = EXCLUDED.subtotal,
                total = EXCLUDED.total,
                -- paid_amount de la API es el real (totalPaid); el del CSV era una
                -- reconstrucción del importador asignando pagos a mano.
                paid_amount = EXCLUDED.paid_amount,
                source_file = 'api',
                updated_at = NOW()
            RETURNING id
        `
        result.upserted++

        const lines = Array.isArray(inv.items) ? inv.items : []
        await sql`DELETE FROM alegra_sales_items WHERE document_id = ${doc.id}`
        for (const [idx, it] of lines.entries()) {
            const qty = Number(it.quantity) || 0
            const price = Number(it.price) || 0
            const taxPct = Number(it.tax?.[0]?.percentage) || 0
            const lineTotal = Number(it.total)
            await sql`
                INSERT INTO alegra_sales_items (
                    document_id, line_no, item_name, item_reference, description,
                    quantity, unit_price, discount, tax_pct, tax_amount, line_total
                )
                VALUES (
                    ${doc.id}, ${idx + 1}, ${it.name ?? "(sin nombre)"}, ${it.reference ?? null},
                    ${it.description ?? null}, ${qty}, ${price}, ${Number(it.discount) || 0},
                    ${taxPct}, ${(qty * price * taxPct) / 100},
                    ${Number.isFinite(lineTotal) ? lineTotal : qty * price}
                )
            `
            result.items++
        }
    }

    return result
}

export interface PaymentSyncResult {
    since: string
    fetched: number
    upserted: number
    skipped: number
}

export async function syncPayments(sinceOverride?: string): Promise<PaymentSyncResult> {
    const since = sinceOverride || (await cursorSince("alegra_payments", "payment_date"))
    const payments = await listPaymentsSince(since)
    const result: PaymentSyncResult = { since, fetched: payments.length, upserted: 0, skipped: 0 }

    for (const p of payments) {
        if (!p.number || !p.date) {
            result.skipped++
            continue
        }

        const clientAlegraId = p.client?.id != null ? Number(p.client.id) : null
        const [client] = clientAlegraId
            ? await sql`SELECT id FROM alegra_clients WHERE alegra_id = ${clientAlegraId}`
            : [undefined]

        // La API trae los documentos asociados estructurados; el CSV los traía como
        // texto libre. Se guarda el mismo formato de siempre para no romper lo que
        // ya lee esa columna.
        const docs = Array.isArray(p.invoices)
            ? p.invoices.map((i: any) => i.numberTemplate?.fullNumber ?? i.number).filter(Boolean).join(", ")
            : null

        await sql`
            INSERT INTO alegra_payments (
                number, payment_date, account, client_id, client_name,
                amount, method, associated_docs, notes, status, source_file
            )
            VALUES (
                ${String(p.number)}, ${p.date}, ${p.bankAccount?.name ?? null},
                ${client?.id ?? null}, ${p.client?.name ?? null},
                ${Number(p.amount) || 0}, ${p.paymentMethod ?? null},
                ${docs}, ${p.observations || null}, ${p.status ?? null}, 'api'
            )
            ON CONFLICT (number, payment_date) DO UPDATE SET
                account = COALESCE(EXCLUDED.account, alegra_payments.account),
                client_id = COALESCE(EXCLUDED.client_id, alegra_payments.client_id),
                client_name = COALESCE(EXCLUDED.client_name, alegra_payments.client_name),
                amount = EXCLUDED.amount,
                method = COALESCE(EXCLUDED.method, alegra_payments.method),
                associated_docs = COALESCE(EXCLUDED.associated_docs, alegra_payments.associated_docs),
                status = COALESCE(EXCLUDED.status, alegra_payments.status),
                source_file = 'api',
                updated_at = NOW()
        `
        result.upserted++
    }

    return result
}


// ── Productos ────────────────────────────────────────────────────────────────

// Normaliza una etiqueta de variante (el color del LED).
//
// Además de tildes y mayúsculas, saca la "k" de kelvin pegada a un número: en
// Alegra conviven "Blanco cálido 2200k" y "Blanco calido 3000K", y el vocabulario
// de specs los tiene cargados sin la k. La regla es angosta a propósito —solo una
// k que sigue a dígitos— así que "Blanco calido" a secas NO se vuelve igual a
// "Blanco calido 3000": son productos distintos y confundirlos factura mal.
export function normalizeVariant(s: string | null | undefined): string | null {
    if (!s) return null
    const n = normalizeName(s).replace(/(\d)\s*k\b/g, "$1").replace(/\s+/g, " ").trim()
    return n || null
}

// En Alegra el color del LED genera productos distintos, nombrados
// "Producto / Color". Partimos el nombre para poder resolver las dos direcciones:
// el pedido habla de producto y color por separado, la factura necesita el ítem
// combinado.
//
// Se parte por el PRIMER " / ": hay cuatro ítems mal cargados con dos barras
// ("... 2500 / Ambar"), y así el resto de la barra queda dentro de la variante en
// vez de romper el parseo.
export function splitItemName(name: string): { base: string; variant: string | null } {
    const i = name.indexOf(" / ")
    if (i < 0) return { base: name.trim(), variant: null }
    return { base: name.slice(0, i).trim(), variant: name.slice(i + 3).trim() || null }
}

export interface ItemSyncResult {
    fetched: number
    inserted: number
    updated: number
    withVariant: number
    bases: number
}

export async function syncItems(): Promise<ItemSyncResult> {
    const items = await listAllItems()
    const result: ItemSyncResult = { fetched: items.length, inserted: 0, updated: 0, withVariant: 0, bases: 0 }
    const bases = new Set<string>()

    // Un INSERT por ítem serían ~1700 round trips: tarda más de un minuto y no
    // entra en el maxDuration de la función en producción. Se cargan por lotes con
    // UNNEST, que manda cada columna como un array y resuelve todo el lote en una
    // sola sentencia.
    const CHUNK = 200
    const rows = items
        .map((it) => {
            const name = String(it.name ?? "").trim()
            if (!name) return null
            const { base, variant } = splitItemName(name)
            const price = Array.isArray(it.price) ? Number(it.price[0]?.price) : Number(it.price)
            if (variant) result.withVariant++
            bases.add(normalizeName(base))
            return {
                alegraId: Number(it.id),
                name,
                nameNorm: normalizeName(name),
                base,
                baseNorm: normalizeName(base),
                variant,
                variantNorm: normalizeVariant(variant),
                price: Number.isFinite(price) ? price : 0,
                status: (it.status as string) ?? null,
                // Cuenta de ingresos: 'Ventas' o 'Materia Prima'.
                account: (it.category?.name as string) ?? null,
            }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const inserted = await sql`
            INSERT INTO alegra_items (
                alegra_id, name, name_normalized, base_name, base_normalized,
                variant_label, variant_normalized, price, status, account
            )
            SELECT * FROM UNNEST(
                ${chunk.map((r) => r.alegraId)}::int[],
                ${chunk.map((r) => r.name)}::varchar[],
                ${chunk.map((r) => r.nameNorm)}::varchar[],
                ${chunk.map((r) => r.base)}::varchar[],
                ${chunk.map((r) => r.baseNorm)}::varchar[],
                ${chunk.map((r) => r.variant)}::varchar[],
                ${chunk.map((r) => r.variantNorm)}::varchar[],
                ${chunk.map((r) => r.price)}::numeric[],
                ${chunk.map((r) => r.status)}::varchar[],
                ${chunk.map((r) => r.account)}::varchar[]
            )
            ON CONFLICT (alegra_id) DO UPDATE SET
                name = EXCLUDED.name,
                name_normalized = EXCLUDED.name_normalized,
                base_name = EXCLUDED.base_name,
                base_normalized = EXCLUDED.base_normalized,
                variant_label = EXCLUDED.variant_label,
                variant_normalized = EXCLUDED.variant_normalized,
                price = EXCLUDED.price,
                status = EXCLUDED.status,
                account = EXCLUDED.account,
                updated_at = NOW()
            RETURNING (xmax = 0) AS is_insert
        `
        for (const r of inserted) {
            if (r.is_insert) result.inserted++
            else result.updated++
        }
    }

    result.bases = bases.size
    return result
}
