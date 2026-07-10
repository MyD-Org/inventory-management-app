-- ============================================
-- Espejo de Alegra: clientes, documentos de venta (facturas / NC / ND),
-- líneas de ítems y pagos. Alegra sigue siendo el sistema de registro;
-- estas tablas son una COPIA de lectura para reportes y para la IA.
-- Carga: scripts/import-alegra.js (exports CSV de Alegra) + API de contactos.
-- Idempotente: claves únicas por código de documento / número de pago.
-- ============================================

-- Clientes espejados (merge de CSV de facturas + API /contacts cuando corra el sync)
CREATE TABLE IF NOT EXISTS alegra_clients (
    id SERIAL PRIMARY KEY,
    alegra_id INTEGER UNIQUE,                -- id en Alegra (solo si vino por API)
    name VARCHAR(200) NOT NULL,
    name_normalized VARCHAR(200) NOT NULL UNIQUE, -- lower + sin acentos, para matchear CSV↔API
    identification VARCHAR(100),
    email VARCHAR(200),
    phone VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documentos de venta: facturas, notas de crédito y notas de débito.
-- El CSV de Alegra exporta una fila por ítem; acá queda 1 fila por documento.
CREATE TABLE IF NOT EXISTS alegra_sales_documents (
    id SERIAL PRIMARY KEY,
    doc_type VARCHAR(20) NOT NULL DEFAULT 'invoice'
        CHECK (doc_type IN ('invoice', 'credit_note', 'debit_note')),
    code VARCHAR(50) NOT NULL,               -- CÓDIGO del export (05283, G-421, L522…)
    issue_date DATE NOT NULL,
    due_date DATE,
    status VARCHAR(50),                      -- Cobrada, Por cobrar, Anulada…
    client_id INTEGER REFERENCES alegra_clients(id),
    client_name VARCHAR(200),                -- como vino en el CSV (por si no matchea)
    seller VARCHAR(100),
    warehouse VARCHAR(100),
    payment_term VARCHAR(50),
    notes TEXT,
    subtotal NUMERIC(14,2) DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    source_file VARCHAR(200),                -- de qué export vino (trazabilidad)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (doc_type, code)
);

-- Líneas de ítems del documento. Se borran y reinsertan al reimportar el documento.
CREATE TABLE IF NOT EXISTS alegra_sales_items (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES alegra_sales_documents(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    item_name VARCHAR(300) NOT NULL,
    item_reference VARCHAR(200),
    description TEXT,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount NUMERIC(14,2) DEFAULT 0,
    tax_pct NUMERIC(7,4) DEFAULT 0,
    tax_amount NUMERIC(14,2) DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    UNIQUE (document_id, line_no)
);

-- Pagos recibidos (Reporte de transacciones, Tipo = Ingreso).
CREATE TABLE IF NOT EXISTS alegra_payments (
    id SERIAL PRIMARY KEY,
    number VARCHAR(50) NOT NULL,             -- Número del recibo en Alegra
    payment_date DATE NOT NULL,
    account VARCHAR(150),                    -- Caja general, Santander…
    client_id INTEGER REFERENCES alegra_clients(id),
    client_name VARCHAR(200),
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    method VARCHAR(50),                      -- Efectivo, Transferencia…
    associated_docs TEXT,                    -- "Facturas: 05298, G-421…" (crudo del export)
    notes TEXT,
    status VARCHAR(50),
    source_file VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (number, payment_date)
);

CREATE INDEX IF NOT EXISTS idx_alegra_docs_client ON alegra_sales_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_alegra_docs_date ON alegra_sales_documents(issue_date);
CREATE INDEX IF NOT EXISTS idx_alegra_items_doc ON alegra_sales_items(document_id);
CREATE INDEX IF NOT EXISTS idx_alegra_items_name ON alegra_sales_items(item_name);
CREATE INDEX IF NOT EXISTS idx_alegra_payments_client ON alegra_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_alegra_payments_date ON alegra_payments(payment_date);

-- Deuda por cliente: facturas + ND − NC (no anuladas) − pagos.
-- Calculada, nunca almacenada: no puede desincronizarse.
CREATE OR REPLACE VIEW alegra_client_balances AS
SELECT
    c.id AS client_id,
    c.name,
    COALESCE(d.billed, 0)::NUMERIC(14,2) AS billed,
    COALESCE(p.paid, 0)::NUMERIC(14,2) AS paid,
    (COALESCE(d.billed, 0) - COALESCE(p.paid, 0))::NUMERIC(14,2) AS balance,
    d.last_invoice_date,
    p.last_payment_date
FROM alegra_clients c
LEFT JOIN (
    SELECT client_id,
           SUM(CASE WHEN doc_type = 'credit_note' THEN -total ELSE total END) AS billed,
           MAX(issue_date) AS last_invoice_date
    FROM alegra_sales_documents
    WHERE LOWER(COALESCE(status, '')) NOT LIKE '%anulad%'
    GROUP BY client_id
) d ON d.client_id = c.id
LEFT JOIN (
    SELECT client_id, SUM(amount) AS paid, MAX(payment_date) AS last_payment_date
    FROM alegra_payments
    WHERE LOWER(COALESCE(status, '')) NOT LIKE '%anulad%'
    GROUP BY client_id
) p ON p.client_id = c.id;

-- Ventas por ítem y por mes (para "qué se vende más" y tendencias).
CREATE OR REPLACE VIEW alegra_sales_by_item AS
SELECT
    i.item_name,
    DATE_TRUNC('month', d.issue_date)::DATE AS month,
    SUM(i.quantity) AS units,
    SUM(i.line_total) AS revenue,
    COUNT(DISTINCT d.id) AS documents
FROM alegra_sales_items i
JOIN alegra_sales_documents d ON d.id = i.document_id
WHERE d.doc_type = 'invoice'
  AND LOWER(COALESCE(d.status, '')) NOT LIKE '%anulad%'
GROUP BY i.item_name, DATE_TRUNC('month', d.issue_date);
