-- ============================================
-- Cuentas por cobrar de Alegra (fuente de verdad del SALDO).
--
-- Problema que resuelve: el CSV de Facturas que se exporta trae solo el TOTAL y un
-- ESTADO ("Por cobrar"), NO el monto pendiente. El saldo se venía RECONSTRUYENDO
-- (total − pagos asociados, ver recomputePaidAmounts), lo que se desalinea con Alegra
-- en facturas viejas con pagos parciales y en facturas que ni siquiera vienen en el CSV
-- (el export de facturas es solo de las recientes). Diferencia medida 2026-07-17:
-- Alegra $36.269.592,23 vs bot $36.089.639,11 (Gigaled G-340, Leo 05239, Dalila).
--
-- Solución: importar el reporte "Cuentas por cobrar" (Excel) de Alegra, que trae el
-- POR COBRAR real por factura, y hacer que el balance del cliente salga de ahí.
-- Se reemplaza entera en cada import (es una foto del momento). Ver lib/alegra-import.ts.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/12-alegra-receivables.sql
-- (idempotente: CREATE TABLE IF NOT EXISTS + DROP/CREATE de la MV).
-- ============================================

CREATE TABLE IF NOT EXISTS alegra_receivables (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,                    -- NÚMERO DE COMPROBANTE (05301, G-340…)
    doc_label VARCHAR(50),                        -- COMPROBANTE ("Factura", "Nota de crédito"…)
    client_id INTEGER REFERENCES alegra_clients(id),
    client_name VARCHAR(200),
    client_name_normalized VARCHAR(200),
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    collected NUMERIC(14,2) NOT NULL DEFAULT 0,   -- COBRADO
    outstanding NUMERIC(14,2) NOT NULL DEFAULT 0, -- POR COBRAR (el saldo real de Alegra)
    issue_date DATE,
    due_date DATE,
    source_file VARCHAR(200),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alegra_receivables_client ON alegra_receivables(client_id);

-- Recrear la MV de balances: el `balance` ahora sale de alegra_receivables CUANDO esa
-- tabla tiene datos (reporte subido); si está vacía, cae a la reconstrucción vieja
-- (total − paid_amount) para no romper nada. billed/paid siguen igual (KPIs históricos).
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_alegra_client_balances_client ON alegra_client_balances(client_id);

CREATE INDEX IF NOT EXISTS idx_alegra_client_balances_balance ON alegra_client_balances(balance DESC);
