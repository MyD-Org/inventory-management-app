// Motor de importación de exports CSV de Alegra al espejo local.
// Server-only. Mismo formato/lógica que scripts/import-alegra.js, en TypeScript,
// para poder usarlo desde la página web (app/api/alegra-import).
// Encoding de Alegra: Windows-1252, separador ';', decimales con coma.

import { sql } from "@/lib/database"

export interface AlegraFile {
    name: string
    buffer: ArrayBuffer
}

export interface FileResult {
    name: string
    kind: "invoices" | "credit_notes" | "payments" | "skipped"
    docs?: number
    created?: number
    updated?: number
    items?: number
    skipped?: number
}

export interface ImportSummary {
    files: FileResult[]
    totals: { documents: number; payments: number; clients: number }
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ""
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
            } else field += ch
        } else if (ch === '"') {
            inQuotes = true
        } else if (ch === ";") {
            row.push(field); field = ""
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++
            row.push(field); field = ""
            if (row.length > 1 || row[0] !== "") rows.push(row)
            row = []
        } else field += ch
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row) }
    return rows
}

function parseDate(s: string | undefined): string | null {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || "").trim())
    if (!m) return null
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

function parseNum(s: string | undefined): number {
    if (!s) return 0
    const n = parseFloat(String(s).trim().replace(",", "."))
    return Number.isFinite(n) ? n : 0
}

function normalizeName(s: string | undefined): string {
    return (s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

function stripPreamble(rows: string[][]): { header: string[]; data: string[][] } {
    let start = 0
    if (rows[0] && rows[0].length <= 2 && /sep=/.test(rows[0][0])) start = 1
    const header = rows[start].map((h) => h.replace(/^﻿|\?/g, "").trim().toUpperCase())
    return { header, data: rows.slice(start + 1) }
}

function detectKind(header: string[]): "invoices" | "credit_notes" | "payments" | null {
    const h = header.join("|")
    // NC: tiene "TOTAL - NOTA CRÉDITO" (columnas distintas a facturas).
    if (h.includes("TOTAL - NOTA CRÉDITO") && h.includes("ÍTEM - NOMBRE")) return "credit_notes"
    if (h.includes("TOTAL - FACTURA") && h.includes("ÍTEM - NOMBRE")) return "invoices"
    if (h.includes("CONCILIADA?") || (h.includes("CUENTA") && h.includes("MÉTODO DE PAGO"))) return "payments"
    return null
}

// ── Carga ────────────────────────────────────────────────────────────────────

type ClientCache = Map<string, number>

async function upsertClient(cache: ClientCache, name: string, extra: Record<string, string | undefined> = {}): Promise<number | null> {
    const norm = normalizeName(name)
    if (!norm) return null
    if (cache.has(norm)) return cache.get(norm)!
    const rows = await sql`
        INSERT INTO alegra_clients (name, name_normalized, identification, address, phone, city)
        VALUES (${name.trim()}, ${norm}, ${extra.identification || null}, ${extra.address || null}, ${extra.phone || null}, ${extra.city || null})
        ON CONFLICT (name_normalized) DO UPDATE SET
            identification = COALESCE(EXCLUDED.identification, alegra_clients.identification),
            address = COALESCE(EXCLUDED.address, alegra_clients.address),
            phone = COALESCE(EXCLUDED.phone, alegra_clients.phone),
            city = COALESCE(EXCLUDED.city, alegra_clients.city),
            updated_at = NOW()
        RETURNING id`
    cache.set(norm, rows[0].id)
    return rows[0].id
}

async function importInvoices(header: string[], data: string[][], sourceFile: string, cache: ClientCache, docType: "invoice" | "credit_note" | "debit_note" = "invoice"): Promise<FileResult> {
    const col = (name: string) => header.findIndex((h) => h === name)
    // Los CSVs de NC usan otros nombres de columnas (NÚMERO, FECHA, TOTAL - NOTA CRÉDITO).
    // Resolvemos con fallbacks para no bifurcar toda la función.
    const codeCol = col("CÓDIGO") !== -1 ? col("CÓDIGO") : col("NÚMERO")
    const totalCol = col("TOTAL - FACTURA") !== -1 ? col("TOTAL - FACTURA") : col("TOTAL - NOTA CRÉDITO")
    const subtotalCol = col("SUBTOTAL - ITEMS") !== -1 ? col("SUBTOTAL - ITEMS") : col("SUBTOTAL - NOTA CRÉDITO")
    const C = {
        date: col("FECHA DE EMISIÓN") !== -1 ? col("FECHA DE EMISIÓN") : col("FECHA"),
        code: codeCol, status: col("ESTADO"), warehouse: col("BODEGA"),
        client: col("CLIENTE - NOMBRE") !== -1 ? col("CLIENTE - NOMBRE") : col("CLIENTE"),
        clientId: col("CLIENTE - IDENTIFICACIÓN"), address: col("CLIENTE - DIRECCIÓN"),
        phone: col("CLIENTE - TELÉFONO"), city: col("CLIENTE - CIUDAD"),
        term: col("PLAZO DE PAGO"), due: col("VENCIMIENTO"), seller: col("VENDEDOR"), notes: col("NOTAS"),
        itName: col("ÍTEM - NOMBRE"), itRef: col("ÍTEM - REFERENCIA"), itDesc: col("ÍTEM - DESCRIPCIÓN"),
        itQty: col("ÍTEM - CANTIDAD"), itPrice: col("ÍTEM - PRECIO UNITARIO"), itDisc: col("ÍTEM - DESCUENTO"),
        itTaxPct: col("ÍTEM - IMPUESTO (%)"), itTaxVal: col("ÍTEM - IMPUESTO (VALOR)"), itTotal: col("ÍTEM - TOTAL"),
        subtotal: subtotalCol, total: totalCol,
    }

    const docs = new Map<string, string[][]>()
    for (const r of data) {
        const code = (r[C.code] || "").trim()
        if (!code) continue
        if (!docs.has(code)) docs.set(code, [])
        docs.get(code)!.push(r)
    }

    let created = 0, updated = 0, items = 0
    for (const [code, rows] of docs) {
        const r0 = rows[0]
        const clientName = (r0[C.client] || "").trim()
        const clientId = await upsertClient(cache, clientName, {
            identification: r0[C.clientId], address: r0[C.address], phone: r0[C.phone], city: r0[C.city],
        })
        const res = await sql`
            INSERT INTO alegra_sales_documents
                (doc_type, code, issue_date, due_date, status, client_id, client_name,
                 seller, warehouse, payment_term, notes, subtotal, total, source_file)
            VALUES (${docType}, ${code}, ${parseDate(r0[C.date])}, ${parseDate(r0[C.due])},
                    ${r0[C.status] || null}, ${clientId}, ${clientName || null},
                    ${C.seller !== -1 ? r0[C.seller] || null : null}, ${r0[C.warehouse] || null},
                    ${C.term !== -1 ? r0[C.term] || null : null},
                    ${r0[C.notes] || null}, ${parseNum(r0[C.subtotal])}, ${parseNum(r0[C.total])}, ${sourceFile})
            ON CONFLICT (doc_type, code) DO UPDATE SET
                issue_date = EXCLUDED.issue_date, due_date = EXCLUDED.due_date,
                status = EXCLUDED.status, client_id = EXCLUDED.client_id,
                client_name = EXCLUDED.client_name, subtotal = EXCLUDED.subtotal,
                total = EXCLUDED.total, source_file = EXCLUDED.source_file, updated_at = NOW()
            RETURNING id, (xmax = 0) AS inserted`
        const { id: docId, inserted } = res[0]
        inserted ? created++ : updated++
        await sql`DELETE FROM alegra_sales_items WHERE document_id = ${docId}`
        let line = 0
        for (const r of rows) {
            if (!(r[C.itName] || "").trim()) continue
            line++
            await sql`
                INSERT INTO alegra_sales_items
                    (document_id, line_no, item_name, item_reference, description,
                     quantity, unit_price, discount, tax_pct, tax_amount, line_total)
                VALUES (${docId}, ${line}, ${r[C.itName].trim()}, ${r[C.itRef] || null}, ${r[C.itDesc] || null},
                        ${parseNum(r[C.itQty])}, ${parseNum(r[C.itPrice])}, ${parseNum(r[C.itDisc])},
                        ${parseNum(r[C.itTaxPct])}, ${parseNum(r[C.itTaxVal])}, ${parseNum(r[C.itTotal])})`
            items++
        }
    }
    return { name: sourceFile, kind: "invoices", docs: docs.size, created, updated, items }
}

async function importPayments(header: string[], data: string[][], sourceFile: string, cache: ClientCache): Promise<FileResult> {
    const col = (name: string) => header.findIndex((h) => h === name)
    const C = {
        account: col("CUENTA"), date: col("FECHA"), number: col("NÚMERO"),
        client: col("CLIENTE"), amount: col("VALOR"), notes: col("NOTAS"),
        assoc: col("ASOCIACIONES"), type: col("TIPO"), method: col("MÉTODO DE PAGO"), status: col("ESTADO"),
    }
    let created = 0, updated = 0, skipped = 0
    for (const r of data) {
        const number = (r[C.number] || "").trim()
        const date = parseDate(r[C.date])
        if (!number || !date) { skipped++; continue }
        if ((r[C.type] || "").trim().toLowerCase() !== "ingreso") { skipped++; continue }
        const clientName = (r[C.client] || "").trim()
        const clientId = await upsertClient(cache, clientName)
        const res = await sql`
            INSERT INTO alegra_payments
                (number, payment_date, account, client_id, client_name, amount,
                 method, associated_docs, notes, status, source_file)
            VALUES (${number}, ${date}, ${r[C.account] || null}, ${clientId}, ${clientName || null},
                    ${parseNum(r[C.amount])}, ${r[C.method] || null}, ${r[C.assoc] || null},
                    ${r[C.notes] || null}, ${r[C.status] || null}, ${sourceFile})
            ON CONFLICT (number, payment_date) DO UPDATE SET
                account = EXCLUDED.account, client_id = EXCLUDED.client_id,
                client_name = EXCLUDED.client_name, amount = EXCLUDED.amount,
                method = EXCLUDED.method, associated_docs = EXCLUDED.associated_docs,
                status = EXCLUDED.status, source_file = EXCLUDED.source_file, updated_at = NOW()
            RETURNING (xmax = 0) AS inserted`
        res[0].inserted ? created++ : updated++
    }
    return { name: sourceFile, kind: "payments", created, updated, skipped }
}

// Reconstruye cuánto se pagó de cada documento asignando cada pago a sus facturas
// asociadas en orden (greedy, como aplica Alegra). Alegra tiene PAGOS PARCIALES: una
// factura queda "Por cobrar" hasta cubrirse entera, y un recibo puede repartirse entre
// varias facturas ("Facturas: G-418, G-419, G-421"). El saldo real por doc es
// total − paid_amount; la MV alegra_client_balances lo agrega por cliente.
export async function recomputePaidAmounts(): Promise<void> {
    const docs = await sql`
        SELECT id, code, total::float AS total
        FROM alegra_sales_documents
        WHERE doc_type IN ('invoice', 'debit_note')
          AND LOWER(COALESCE(status, '')) NOT LIKE '%anulad%'`
    const byCode = new Map<string, { id: number; total: number; paid: number }>(
        docs.map((d: any) => [d.code as string, { id: d.id, total: d.total, paid: 0 }]),
    )
    // Orden cronológico: los pagos viejos consumen primero (igual que la aplicación real).
    const pays = await sql`
        SELECT amount::float AS amount, associated_docs
        FROM alegra_payments
        WHERE LOWER(COALESCE(status, '')) NOT LIKE '%anulad%'
        ORDER BY payment_date ASC, number ASC`
    for (const p of pays) {
        let rest: number = p.amount
        // "Facturas: 05298, G-421" → ["05298", "G-421"]
        const codes = String(p.associated_docs ?? "").replace(/^[^:]*:/, "").split(",").map((s) => s.trim()).filter(Boolean)
        for (const code of codes) {
            if (rest <= 0) break
            const d = byCode.get(code)
            if (!d) continue // factura no espejada (o anulada): esa porción queda sin asignar
            const take = Math.min(rest, Math.max(d.total - d.paid, 0))
            d.paid += take
            rest -= take
        }
    }
    const ids: number[] = []
    const paids: number[] = []
    for (const d of byCode.values()) {
        ids.push(d.id)
        paids.push(Math.round(d.paid * 100) / 100)
    }
    await sql`
        UPDATE alegra_sales_documents d
        SET paid_amount = v.paid, updated_at = NOW()
        FROM (SELECT UNNEST(${ids}::int[]) AS id, UNNEST(${paids}::numeric[]) AS paid) v
        WHERE d.id = v.id AND d.paid_amount IS DISTINCT FROM v.paid`
}

export async function importAlegraFiles(files: AlegraFile[]): Promise<ImportSummary> {
    const cache: ClientCache = new Map()
    const results: FileResult[] = []
    for (const f of files) {
        const text = new TextDecoder("windows-1252").decode(f.buffer)
        const { header, data } = stripPreamble(parseCsv(text))
        const kind = detectKind(header)
        if (kind === "invoices") results.push(await importInvoices(header, data, f.name, cache, "invoice"))
        else if (kind === "credit_notes") results.push({ ...(await importInvoices(header, data, f.name, cache, "credit_note")), kind: "credit_notes" as const })
        else if (kind === "payments") results.push(await importPayments(header, data, f.name, cache))
        else results.push({ name: f.name, kind: "skipped" })
    }
    const [{ documents }] = await sql`SELECT COUNT(*)::int AS documents FROM alegra_sales_documents`
    const [{ payments }] = await sql`SELECT COUNT(*)::int AS payments FROM alegra_payments`
    const [{ clients }] = await sql`SELECT COUNT(*)::int AS clients FROM alegra_clients`

    // Reasignar pagos → saldos por documento y refrescar la MV que los agrega por
    // cliente. Sin esto los balances quedan viejos hasta el próximo import.
    try {
        await recomputePaidAmounts()
        await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY alegra_client_balances`
    } catch (e) {
        console.warn("No se pudo recalcular/refrescar alegra_client_balances:", e instanceof Error ? e.message : e)
    }

    return { files: results, totals: { documents, payments, clients } }
}
