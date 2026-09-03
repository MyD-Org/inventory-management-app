-- ============================================
-- Renombra el estado-cliente de 'por_facturar' de "En preparación" a
-- "Preparando entrega", para que coincida con la etiqueta nueva de la columna
-- del tablero del taller (STATUS_LABELS.por_facturar en lib/order-statuses.ts).
-- Solo toca esa clave del jsonb — no pisa el resto por si alguien ya
-- personalizó otro estado desde /pedidos/opciones.
--
-- Aplicar en prod: node scripts/run-sql.js scripts/31-preparando-entrega.sql
-- ============================================

UPDATE app_settings
SET value = jsonb_set(value, '{por_facturar}', '"Preparando entrega"'),
    updated_at = NOW()
WHERE key = 'order_customer_status';
