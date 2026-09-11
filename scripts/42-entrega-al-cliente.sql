-- ============================================
-- Marcar que una línea del pedido SE ENTREGÓ al cliente.
--
-- CONTEXTO: 41-remitos-parciales.sql trajo delivered_quantity, que dice cuánto de
-- cada línea tiene REMITO emitido. Eso es un hecho del papel, no de la mercadería:
-- un pedido puede estar remitido entero y llevar una semana esperando en el
-- mostrador. Quién se llevó qué no estaba en ningún lado —el estado 'retirado' lo
-- dice del pedido COMPLETO, y un pedido que sale por partes se entrega por partes—.
--
-- CÓMO QUEDA: cada línea guarda cuánto de lo remitido ya se entregó. En pantalla es
-- un check al lado de la línea, y aparece SOLO donde hay remito: entregar algo que
-- no tiene papel es lo que el circuito justamente no quiere.
--
-- POR QUÉ UNA CANTIDAD Y NO UN BOOLEAN, si en pantalla es un check: porque la línea
-- se sigue remitiendo. Si el check fuera un sí/no, marcar "entregado" con 4 de 10
-- remitidas dejaría la línea diciendo "entregado" para siempre, y las 6 que salgan
-- después nacerían entregadas sin que nadie las haya dado. Guardando CUÁNTO se
-- entregó, el check se calcula —entregado = lo entregado alcanza a lo remitido— y
-- se destilda solo cuando aparece mercadería nueva. El check escribe lo remitido y
-- destildar escribe 0; nadie tipea un número.
--
-- NO TOCA EL ESTADO DEL PEDIDO. 'retirado' sigue siendo del pedido entero y lo
-- mueve una persona; esto es el detalle de qué se llevó. Que marcar la última línea
-- pase el pedido a 'retirado' es una decisión de flujo que nadie pidió.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/42-entrega-al-cliente.sql
-- ============================================

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS handed_over_quantity DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Quién marcó la entrega y cuándo va en el hilo de actividad, igual que el retiro
-- de materiales y la emisión de documentos: es de lo primero que se busca cuando
-- hay que reconstruir qué pasó con un pedido.
ALTER TABLE order_events DROP CONSTRAINT IF EXISTS order_events_kind_check;

ALTER TABLE order_events
    ADD CONSTRAINT order_events_kind_check CHECK (kind IN (
        'created', 'status', 'field', 'item_added', 'item_updated',
        'item_removed', 'materials_consumed', 'materials_returned', 'invoice',
        'handover', 'note'
    ));
