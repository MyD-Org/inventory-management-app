-- ============================================
-- Unifica embalado y facturado en por_facturar.
--
-- Aplicar en prod: node scripts/run-sql.js scripts/18-por-facturar.sql
-- ============================================

UPDATE orders SET status = 'por_facturar' WHERE status IN ('embalado', 'facturado');

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('por_revisar', 'recibido', 'en_proceso', 'por_facturar',
                      'listo_para_retirar', 'retirado', 'cancelado'));

INSERT INTO app_settings (key, value) VALUES ('order_customer_status', '{
    "por_revisar": "Recibido",
    "recibido": "Recibido",
    "en_proceso": "En fabricación",
    "por_facturar": "En preparación",
    "listo_para_retirar": "Listo para retirar",
    "retirado": "Entregado",
    "cancelado": "Cancelado"
}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
