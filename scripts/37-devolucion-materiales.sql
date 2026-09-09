-- ============================================
-- Devolución de materiales retirados por un pedido.
--
-- CONTEXTO: retirar material por un pedido escribe una SALIDA en stock_movements
-- con order_id (ver consumeOrderMaterials). Lo que no existía era el camino de
-- vuelta: si el taller retiró 3 placas y al final no las usa, el stock quedaba
-- descontado para siempre y el pedido figuraba como "descontado" aunque el
-- material estuviera de nuevo en el estante. La única salida era un ajuste a mano
-- en el inventario, que no queda vinculado al pedido y deja la cuenta del pedido
-- mintiendo igual.
--
-- CÓMO QUEDA: devolver escribe una ENTRADA en stock_movements con el mismo
-- order_id. No se borra ni se edita la salida original: las dos quedan en el
-- historial del inventario, que es lo que realmente pasó (salió y volvió), y es
-- la misma regla que ya sigue el resto del sistema con las fotos históricas.
--
-- Lo consumido por un pedido pasa a ser NETO: salidas menos entradas. Eso lo
-- resuelven las consultas (materialNeeds, extraConsumedMaterials,
-- listOrdersWithPendingMaterials), no hace falta columna nueva.
--
-- QUÉ TOCA ESTA MIGRACIÓN: solo el CHECK de order_events.kind, para poder
-- registrar la devolución en la actividad del pedido igual que el retiro. No
-- crea tablas, no reescribe filas y no borra nada.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/37-devolucion-materiales.sql
-- ============================================

ALTER TABLE order_events DROP CONSTRAINT IF EXISTS order_events_kind_check;

ALTER TABLE order_events
    ADD CONSTRAINT order_events_kind_check CHECK (kind IN (
        'created', 'status', 'field', 'item_added', 'item_updated',
        'item_removed', 'materials_consumed', 'materials_returned', 'invoice', 'note'
    ));
