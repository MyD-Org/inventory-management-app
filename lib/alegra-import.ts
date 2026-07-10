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
    kind: "invoices" | "payments" | "skipped"
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

function detectKind(header: string[]): "invoices" | "payments" | null {
    const h = header.join("|")
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

async function importInvoices(header: string[], data: string[][], sourceFile: string, cache: ClientCache): Promise<FileResult> {
    const col = (name: string) => header.findIndex((h) => h === name)
    const C = {
        date: col("FECHA DE EMISIÓN") !== -1 ? col("FECHA DE EMISIÓN") : col("FECHA"),
        code: col("CÓDIGO"), status: col("ESTADO"), warehouse: col("BODEGA"),
        client: col("CLIENTE - NOMBRE") !== -1 ? col("CLIENTE - NOMBRE") : col("CLIENTE"),
        clientId: col("CLIENTE - IDENTIFICACIÓN"), address: col("CLIENTE - DIRECCIÓN"),
        phone: col("CLIENTE - TELÉFONO"), city: col("CLIENTE - CIUDAD"),
        term: col("PLAZO DE PAGO"), due: col("VENCIMIENTO"), seller: col("VENDEDOR"), notes: col("NOTAS"),
        itName: col("ÍTEM - NOMBRE"), itRef: col("ÍTEM - REFERENCIA"), itDesc: col("ÍTEM - DESCRIPCIÓN"),
        itQty: col("ÍTEM - CANTIDAD"), itPrice: col("ÍTEM - PRECIO UNITARIO"), itDisc: col("ÍTEM - DESCUENTO"),
        itTaxPct: col("ÍTEM - IMPUESTO (%)"), itTaxVal: col("ÍTEM - IMPUESTO (VALOR)"), itTotal: col("ÍTEM - TOTAL"),
        subtotal: col("SUBTOTAL - ITEMS"), total: col("TOTAL - FACTURA"),
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
            VALUES ('invoice', ${code}, ${parseDate(r0[C.date])}, ${parseDate(r0[C.due])},
                    ${r0[C.status] || null}, ${clientId}, ${clientName || null},
                    ${r0[C.seller] || null}, ${r0[C.warehouse] || null}, ${r0[C.term] || null},
                    ${r0[C.notes] || null}, ${parseNum(r0[C.subtotal])}, ${parseNum(r0[C.total])}, ${sourceFile})
            ON CONFLICT (doc_type, code) DO UPDATE SET
                issue_date = EXCLUDED.issue_date, due_date = EXCLUDED.due_date,
                status = EXCLUDED.status, client_id = EXCLUDED.client_id,
                client_name = EXCLUDED.client_name, subtotal = EXCLUDED.subtotal,
                total = EXCLUDED.total, source_file = EXCLUDED.source_file, updated_at = NOW()
            RETURNING (xmax = 0) AS inserted`
        res[0].inserted ? created++ : updated++

        const docId = (await sql`SELECT id FROM alegra_sales_documents WHERE doc_type = 'invoice' AND code = ${code}`)[0].id
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

export async function importAlegraFiles(files: AlegraFile[]): Promise<ImportSummary> {
    const cache: ClientCache = new Map()
    const results: FileResult[] = []
    for (const f of files) {
        const text = new TextDecoder("windows-1252").decode(f.buffer)
        const { header, data } = stripPreamble(parseCsv(text))
        const kind = detectKind(header)
        if (kind === "invoices") results.push(await importInvoices(header, data, f.name, cache))
        else if (kind === "payments") results.push(await importPayments(header, data, f.name, cache))
        else results.push({ name: f.name, kind: "skipped" })
    }
    const [{ documents }] = await sql`SELECT COUNT(*)::int AS documents FROM alegra_sales_documents`
    const [{ payments }] = await sql`SELECT COUNT(*)::int AS payments FROM alegra_payments`
    const [{ clients }] = await sql`SELECT COUNT(*)::int AS clients FROM alegra_clients`
    return { files: results, totals: { documents, payments, clients } }
}
