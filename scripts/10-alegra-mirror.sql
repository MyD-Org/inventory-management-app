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
    -- Pagos aplicados a este documento (reconstruido por el importador asignando cada
    -- pago a sus facturas asociadas en orden). Saldo pendiente = total − paid_amount.
    paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
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

-- Balance del cliente. Tres columnas:
-- - billed: facturado histórico neto (facturas + ND − NC, sin anuladas). Para KPIs.
-- - paid: cobrado histórico (todos los pagos ingresados no anulados).
-- - balance: saldo pendiente REAL, matchea el reporte "Cuentas por cobrar" de Alegra.
--   Suma el saldo (total − paid_amount) de facturas/ND con status "Por cobrar".
--   OJO: Alegra tiene PAGOS PARCIALES — un recibo puede repartirse entre varias
--   facturas y una factura queda "Por cobrar" hasta cubrirse entera (verificado
--   2026-07-10: factura 05298 $19,6M con pago parcial de $10M). Por eso el status
--   solo no alcanza: paid_amount lo reconstruye el importador asignando cada pago
--   a sus facturas asociadas en orden (recomputePaidAmounts).
-- MATERIALIZED: pre-computa la agregación en disco para que list_receivables lea
-- rápido sin recalcular joins/aggs por cada request. Se REFRESHea al final del
-- importador (scripts/import-alegra.js). Nunca queda inconsistente porque el
-- importador refresca al terminar. Requiere DROP + CREATE (no acepta REPLACE).

-- Migración para bases ya creadas (CREATE TABLE IF NOT EXISTS no agrega columnas).
ALTER TABLE alegra_sales_documents ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Migración VIEW → MV: versiones anteriores de este script creaban una VIEW común con
-- este nombre. Comparten namespace: sin este DROP, el IF NOT EXISTS de abajo la saltea,
-- el CREATE UNIQUE INDEX falla y el REFRESH del importador cae siempre en el catch
-- (la deuda quedaría calculada con la fórmula vieja billed − paid).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'alegra_client_balances') THEN
        EXECUTE 'DROP VIEW alegra_client_balances';
    END IF;
END $$;

-- Cuentas por cobrar (saldo REAL importado del reporte Excel de Alegra). El balance de
-- la MV sale de acá cuando esta tabla tiene datos; ver scripts/12-alegra-receivables.sql
-- (misma definición) y lib/alegra-import.ts. Se crea acá para que un setup desde cero
-- quede consistente aunque no se corra el 12.
CREATE TABLE IF NOT EXISTS alegra_receivables (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    doc_label VARCHAR(50),
    client_id INTEGER REFERENCES alegra_clients(id),
    client_name VARCHAR(200),
    client_name_normalized VARCHAR(200),
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    collected NUMERIC(14,2) NOT NULL DEFAULT 0,
    outstanding NUMERIC(14,2) NOT NULL DEFAULT 0,
    issue_date DATE,
    due_date DATE,
    source_file VARCHAR(200),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alegra_receivables_client ON alegra_receivables(client_id);

-- La definición cambió (saldo real desde alegra_receivables, con fallback a la
-- reconstrucción total − paid_amount): recrear siempre para converger.
DROP MATERIALIZED VIEW IF EXISTS alegra_client_balances;

CREATE MATERIALIZED VIEW alegra_client_balances AS
WITH recv_flag AS (
    SELECT EXISTS (SELECT 1 FROM alegra_receivables) AS present
)
SELECT
    c.id AS client_id,
    c.name,
    COALESCE(d.billed, 0)::NUMERIC(14,2) AS billed,
    COALESCE(p.paid, 0)::NUMERIC(14,2) AS paid,
    CASE WHEN rf.present THEN COALESCE(r.outstanding, 0) ELSE COALESCE(o.balance, 0) END::NUMERIC(14,2) AS balance,
    d.last_invoice_date,
    p.last_payment_date
FROM alegra_clients c
CROSS JOIN recv_flag rf
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
) p ON p.client_id = c.id
LEFT JOIN (
    SELECT client_id, SUM(GREATEST(total - paid_amount, 0)) AS balance
    FROM alegra_sales_documents
    WHERE doc_type IN ('invoice','debit_note')
      AND LOWER(COALESCE(status, '')) = 'por cobrar'
    GROUP BY client_id
) o ON o.client_id = c.id
LEFT JOIN (
    SELECT client_id, SUM(outstanding) AS outstanding
    FROM alegra_receivables
    WHERE client_id IS NOT NULL
    GROUP BY client_id
) r ON r.client_id = c.id;

-- Índices para la MV: UNIQUE necesario para REFRESH CONCURRENTLY (sin lock de lectura);
-- el de balance acelera el ORDER BY balance DESC del list_receivables.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alegra_client_balances_client ON alegra_client_balances(client_id);
CREATE INDEX IF NOT EXISTS idx_alegra_client_balances_balance ON alegra_client_balances(balance DESC);

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
