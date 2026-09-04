-- ============================================
-- Stock fraccionado: materias primas que se miden, no se cuentan.
--
-- CONTEXTO: el inventario nació contando unidades y piezas, así que todas las
-- columnas de stock son INTEGER. Eso alcanza para un prensacable o una tira LED,
-- pero no para el cable, que se compra por rollo y se consume por metro. Hasta
-- hoy el cable se modelaba como un SKU por largo fijo ("Cable AR CANON 9M",
-- "…6M"), contado por unidad: funciona mientras los largos sean pocos y no
-- cambien, y se rompe apenas alguien necesita 2,5 m.
--
-- Y se rompe RUIDOSAMENTE, que es lo único bueno: Postgres no redondea al meter
-- un decimal en un INTEGER, tira
--     invalid input syntax for type integer: "2.5"
-- así que el descuento de materiales del pedido falla entero. Nunca se descontó
-- de menos en silencio.
--
-- QUÉ TOCA ESTA MIGRACIÓN: las tres columnas de stock de inventory y las tres de
-- stock_movements pasan a numeric(12,2). Nada más.
--
--   * available_stock hay que TIRARLA Y REHACERLA: es GENERATED ALWAYS AS
--     (current_stock - reserved_stock) y Postgres no deja cambiar el tipo de las
--     columnas de las que depende. Se recrea idéntica, con el tipo nuevo.
--   * materials.min_stock / max_stock siguen siendo INTEGER a propósito. Son
--     umbrales de alerta, no cantidades: "avisame cuando queden menos de 10" no
--     necesita decimales, y comparar numeric contra int es transparente para
--     Postgres. Cambiarlas sería tocar más superficie sin ganar nada.
--
-- CUIDADO AL LEER ESTO DESDE JS: el driver devuelve numeric como STRING
-- ("250.00"), no como number — INTEGER sí venía como number. Todo el código que
-- haga cuentas con current_stock, available_stock o quantity tiene que envolver
-- el valor en Number() ANTES de operar, o suma concatenando. El módulo de
-- pedidos (lib/orders.ts, lib/order-actions.ts) ya lo hacía; el de inventario se
-- corrigió junto con esta migración.
--
-- No reescribe filas ni borra datos: 250 pasa a ser 250.00, que es el mismo
-- número. Es reversible mientras ninguna fila tenga decimales.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/32-stock-decimal.sql
-- ============================================

ALTER TABLE inventory DROP COLUMN IF EXISTS available_stock;

ALTER TABLE inventory
    ALTER COLUMN current_stock  TYPE numeric(12,2),
    ALTER COLUMN reserved_stock TYPE numeric(12,2);

ALTER TABLE inventory
    ADD COLUMN available_stock numeric(12,2)
    GENERATED ALWAYS AS (current_stock - reserved_stock) STORED;

ALTER TABLE stock_movements
    ALTER COLUMN quantity       TYPE numeric(12,2),
    ALTER COLUMN previous_stock TYPE numeric(12,2),
    ALTER COLUMN new_stock      TYPE numeric(12,2);
