// Importador de exports CSV de Alegra al espejo local (scripts/10-alegra-mirror.sql).
//
// Uso:
//   node scripts/import-alegra.js <archivo-o-carpeta> [...más]
//
// Detecta por encabezado si el CSV es de FACTURAS o de TRANSACCIONES (pagos)
// y carga lo que corresponda. Idempotente: reimportar el mismo archivo no
// duplica (facturas: UNIQUE doc_type+code; pagos: UNIQUE number+date).
// Encoding de Alegra: Windows-1252, separador ';', decimales con coma.

const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

// ── Parsing ──────────────────────────────────────────────────────────────────

// Parser CSV mínimo: separador ';', comillas dobles, saltos de línea DENTRO de
// campos entrecomillados (las notas de Alegra los traen).
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += ch;
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ";") {
            row.push(field); field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(field); field = "";
            if (row.length > 1 || row[0] !== "") rows.push(row);
            row = [];
        } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
}

function decodeWin1252(buf) {
    return new TextDecoder("windows-1252").decode(buf);
}

// "03/01/2025" → "2025-01-03" (null si vacío/no parsea)
function parseDate(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || "").trim());
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// "37218,00" → 37218.00 (Alegra no usa separador de miles en el CSV)
function parseNum(s) {
    if (!s) return 0;
    const n = parseFloat(String(s).trim().replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

// Para matchear el mismo cliente entre CSV y API: minúsculas, sin acentos, sin dobles espacios.
function normalizeName(s) {
    return (s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

// Encabezado real: Alegra antepone una línea "sep=;" (a veces con BOM).
function stripPreamble(rows) {
    let start = 0;
    if (rows[0] && rows[0].length <= 2 && /sep=/.test(rows[0][0])) start = 1;
    return { header: rows[start].map((h) => h.replace(/^﻿|\?/g, "").trim().toUpperCase()), data: rows.slice(start + 1) };
}

function detectKind(header) {
    const h = header.join("|");
    // NC de Alegra: header con "TOTAL - NOTA CRÉDITO", columnas distintas a facturas.
    if (h.includes("TOTAL - NOTA CRÉDITO") && h.includes("ÍTEM - NOMBRE")) return "credit_notes";
    if (h.includes("TOTAL - FACTURA") && h.includes("ÍTEM - NOMBRE")) return "invoices";
    if (h.includes("CONCILIADA?") || (h.includes("CUENTA") && h.includes("MÉTODO DE PAGO"))) return "payments";
    return null;
}

// ── Carga ────────────────────────────────────────────────────────────────────

async function upsertClient(sql, cache, name, extra = {}) {
    const norm = normalizeName(name);
    if (!norm) return null;
    if (cache.has(norm)) return cache.get(norm);
    const rows = await sql`
        INSERT INTO alegra_clients (name, name_normalized, identification, address, phone, city)
        VALUES (${name.trim()}, ${norm}, ${extra.identification || null}, ${extra.address || null}, ${extra.phone || null}, ${extra.city || null})
        ON CONFLICT (name_normalized) DO UPDATE SET
            identification = COALESCE(EXCLUDED.identification, alegra_clients.identification),
            address = COALESCE(EXCLUDED.address, alegra_clients.address),
            phone = COALESCE(EXCLUDED.phone, alegra_clients.phone),
            city = COALESCE(EXCLUDED.city, alegra_clients.city),
            updated_at = NOW()
        RETURNING id`;
    cache.set(norm, rows[0].id);
    return rows[0].id;
}

async function importInvoices(sql, header, data, sourceFile, clientCache, docType = "invoice") {
    const col = (name) => header.findIndex((h) => h === name);
    // Fallbacks para NC (Alegra usa nombres distintos: NÚMERO, TOTAL - NOTA CRÉDITO, SUBTOTAL - NOTA CRÉDITO).
    const codeCol = col("CÓDIGO") !== -1 ? col("CÓDIGO") : col("NÚMERO");
    const totalCol = col("TOTAL - FACTURA") !== -1 ? col("TOTAL - FACTURA") : col("TOTAL - NOTA CRÉDITO");
    const subtotalCol = col("SUBTOTAL - ITEMS") !== -1 ? col("SUBTOTAL - ITEMS") : col("SUBTOTAL - NOTA CRÉDITO");
    const C = {
        date: col("FECHA DE EMISIÓN") !== -1 ? col("FECHA DE EMISIÓN") : col("FECHA"),
        code: codeCol, status: col("ESTADO"), warehouse: col("BODEGA"),
        client: col("CLIENTE - NOMBRE") !== -1 ? col("CLIENTE - NOMBRE") : col("CLIENTE"),
        clientId: col("CLIENTE - IDENTIFICACIÓN"), address: col("CLIENTE - DIRECCIÓN"),
        phone: col("CLIENTE - TELÉFONO"), city: col("CLIENTE - CIUDAD"),
        term: col("PLAZO DE PAGO"), due: col("VENCIMIENTO"), seller: col("VENDEDOR"),
        notes: col("NOTAS"),
        itName: col("ÍTEM - NOMBRE"), itRef: col("ÍTEM - REFERENCIA"), itDesc: col("ÍTEM - DESCRIPCIÓN"),
        itQty: col("ÍTEM - CANTIDAD"), itPrice: col("ÍTEM - PRECIO UNITARIO"), itDisc: col("ÍTEM - DESCUENTO"),
        itTaxPct: col("ÍTEM - IMPUESTO (%)"), itTaxVal: col("ÍTEM - IMPUESTO (VALOR)"), itTotal: col("ÍTEM - TOTAL"),
        subtotal: subtotalCol, total: totalCol,
    };

    // Agrupar filas (1 por ítem) por código de documento
    const docs = new Map();
    for (const r of data) {
        const code = (r[C.code] || "").trim();
        if (!code) continue;
        if (!docs.has(code)) docs.set(code, { rows: [] });
        docs.get(code).rows.push(r);
    }

    let created = 0, updated = 0, items = 0;
    for (const [code, { rows }] of docs) {
        const r0 = rows[0];
        const clientName = (r0[C.client] || "").trim();
        const clientId = await upsertClient(sql, clientCache, clientName, {
            identification: r0[C.clientId], address: r0[C.address], phone: r0[C.phone], city: r0[C.city],
        });
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
            RETURNING id, (xmax = 0) AS inserted`;
        const { id: docId, inserted } = res[0];
        inserted ? created++ : updated++;
        await sql`DELETE FROM alegra_sales_items WHERE document_id = ${docId}`;
        for (const [idx, r] of rows.entries()) {
            if (!(r[C.itName] || "").trim()) continue;
            await sql`
                INSERT INTO alegra_sales_items
                    (document_id, line_no, item_name, item_reference, description,
                     quantity, unit_price, discount, tax_pct, tax_amount, line_total)
                VALUES (${docId}, ${idx + 1}, ${r[C.itName].trim()}, ${r[C.itRef] || null}, ${r[C.itDesc] || null},
                        ${parseNum(r[C.itQty])}, ${parseNum(r[C.itPrice])}, ${parseNum(r[C.itDisc])},
                        ${parseNum(r[C.itTaxPct])}, ${parseNum(r[C.itTaxVal])}, ${parseNum(r[C.itTotal])})`;
            items++;
        }
    }
    return { docs: docs.size, created, updated, items };
}

async function importPayments(sql, header, data, sourceFile, clientCache) {
    const col = (name) => header.findIndex((h) => h === name);
    const C = {
        account: col("CUENTA"), date: col("FECHA"), number: col("NÚMERO"),
        client: col("CLIENTE"), amount: col("VALOR"), notes: col("NOTAS"),
        assoc: col("ASOCIACIONES"), type: col("TIPO"), method: col("MÉTODO DE PAGO"), status: col("ESTADO"),
    };
    let created = 0, updated = 0, skipped = 0;
    for (const r of data) {
        const number = (r[C.number] || "").trim();
        const date = parseDate(r[C.date]);
        if (!number || !date) { skipped++; continue; }
        // Solo ingresos: los egresos (pagos a proveedores) no son cobranza de clientes.
        if ((r[C.type] || "").trim().toLowerCase() !== "ingreso") { skipped++; continue; }
        const clientName = (r[C.client] || "").trim();
        const clientId = await upsertClient(sql, clientCache, clientName);
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
            RETURNING (xmax = 0) AS inserted`;
        res[0].inserted ? created++ : updated++;
    }
    return { created, updated, skipped };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function collectCsvFiles(args) {
    const files = [];
    for (const a of args) {
        const st = fs.statSync(a);
        if (st.isDirectory()) {
            for (const f of fs.readdirSync(a)) if (f.toLowerCase().endsWith(".csv")) files.push(path.join(a, f));
        } else if (a.toLowerCase().endsWith(".csv")) files.push(a);
    }
    return files;
}

async function run() {
    if (!process.env.DATABASE_URL) { console.error("❌ DATABASE_URL no está seteada"); process.exit(1); }
    const args = process.argv.slice(2);
    if (!args.length) {
        console.log("Uso: node scripts/import-alegra.js <archivo.csv | carpeta> [...]");
        process.exit(1);
    }
    const sql = neon(process.env.DATABASE_URL);
    const clientCache = new Map();
    const files = collectCsvFiles(args);
    if (!files.length) { console.error("❌ No encontré archivos .csv en los argumentos"); process.exit(1); }

    for (const file of files) {
        const text = decodeWin1252(fs.readFileSync(file));
        const { header, data } = stripPreamble(parseCsv(text));
        const kind = detectKind(header);
        const base = path.basename(file);
        if (kind === "invoices") {
            const r = await importInvoices(sql, header, data, base, clientCache, "invoice");
            console.log(`✅ ${base}: ${r.docs} facturas (${r.created} nuevas, ${r.updated} actualizadas), ${r.items} líneas`);
        } else if (kind === "credit_notes") {
            const r = await importInvoices(sql, header, data, base, clientCache, "credit_note");
            console.log(`✅ ${base}: ${r.docs} notas de crédito (${r.created} nuevas, ${r.updated} actualizadas), ${r.items} líneas`);
        } else if (kind === "payments") {
            const r = await importPayments(sql, header, data, base, clientCache);
            console.log(`✅ ${base}: pagos ${r.created} nuevos, ${r.updated} actualizados, ${r.skipped} omitidos (egresos/incompletos)`);
        } else {
            console.log(`⏭️  ${base}: formato no reconocido (no es export de facturas, NC ni transacciones), lo salteo`);
        }
    }

    const [{ count: docs }] = await sql`SELECT COUNT(*)::int AS count FROM alegra_sales_documents`;
    const [{ count: pays }] = await sql`SELECT COUNT(*)::int AS count FROM alegra_payments`;
    const [{ count: clients }] = await sql`SELECT COUNT(*)::int AS count FROM alegra_clients`;
    console.log(`\n📊 Totales en el espejo: ${docs} documentos, ${pays} pagos, ${clients} clientes`);

    // Reasignar pagos → saldos por documento y refrescar la MV de saldos. Alegra tiene
    // pagos parciales (un recibo se reparte entre facturas y una factura queda "Por
    // cobrar" hasta cubrirse): el saldo real es total − paid_amount, no el status binario.
    try {
        await recomputePaidAmounts(sql);
        await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY alegra_client_balances`;
        console.log("♻️  saldos reasignados y alegra_client_balances refrescada");
    } catch (e) {
        console.warn("⚠️  No se pudo recalcular/refrescar alegra_client_balances:", e.message);
    }
}

// Espejo de lib/alegra-import.ts#recomputePaidAmounts (mantener en sincronía):
// asigna cada pago a sus facturas asociadas en orden (greedy, cronológico).
async function recomputePaidAmounts(sql) {
    const docs = await sql`
        SELECT id, code, total::float AS total
        FROM alegra_sales_documents
        WHERE doc_type IN ('invoice', 'debit_note')
          AND LOWER(COALESCE(status, '')) NOT LIKE '%anulad%'`;
    const byCode = new Map(docs.map((d) => [d.code, { id: d.id, total: d.total, paid: 0 }]));
    const pays = await sql`
        SELECT amount::float AS amount, associated_docs
        FROM alegra_payments
        WHERE LOWER(COALESCE(status, '')) NOT LIKE '%anulad%'
        ORDER BY payment_date ASC, number ASC`;
    for (const p of pays) {
        let rest = p.amount;
        const codes = String(p.associated_docs ?? "").replace(/^[^:]*:/, "").split(",").map((s) => s.trim()).filter(Boolean);
        for (const code of codes) {
            if (rest <= 0) break;
            const d = byCode.get(code);
            if (!d) continue; // factura no espejada (o anulada): esa porción queda sin asignar
            const take = Math.min(rest, Math.max(d.total - d.paid, 0));
            d.paid += take;
            rest -= take;
        }
    }
    const ids = [], paids = [];
    for (const d of byCode.values()) {
        ids.push(d.id);
        paids.push(Math.round(d.paid * 100) / 100);
    }
    await sql`
        UPDATE alegra_sales_documents d
        SET paid_amount = v.paid, updated_at = NOW()
        FROM (SELECT UNNEST(${ids}::int[]) AS id, UNNEST(${paids}::numeric[]) AS paid) v
        WHERE d.id = v.id AND d.paid_amount IS DISTINCT FROM v.paid`;
}

run().catch((e) => { console.error("❌", e.message); process.exit(1); });
