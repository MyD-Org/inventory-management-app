-- ============================================
-- Precio unitario en los movimientos de stock.
--
-- Contexto: hasta ahora una entrada de stock no guardaba el precio pagado
-- por unidad. El unit_cost del material era fijo (se editaba a mano en la
-- ficha), así que los costos de fabricación calculados en /costos podían
-- estar desactualizados y no había histórico de cuánto se pagó por cada
-- ingreso.
--
-- Ahora: /api/stock/movement acepta un unit_cost opcional en el body.
-- Cuando es una ENTRADA con unit_cost > 0, el endpoint también pisa
-- materials.unit_cost con ese valor (política "último precio pisa";
-- simple, alcanza para arrancar). El histórico queda en stock_movements
-- para poder evolucionar a promedio ponderado / FIFO más adelante sin
-- perder datos.
--
-- Nullable: los movimientos históricos y los que no cargan precio (salida,
-- ajuste, o entrada sin factura a mano) quedan con NULL.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/13-stock-movement-unit-cost.sql
-- ============================================

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);
