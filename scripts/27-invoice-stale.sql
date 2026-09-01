-- ============================================
-- Avisar cuando el pedido cambió DESPUÉS de facturar.
--
-- CONTEXTO: hasta ahora un pedido facturado no se podía tocar —agregar, editar o
-- quitar ítems devolvía "El pedido ya fue facturado"—. Esa restricción se sacó: el
-- taller necesita poder corregir. Pero si el pedido cambia y la factura no, quedan
-- diciendo cosas distintas y nadie se entera.
--
-- POR QUÉ UNA BANDERA Y NO UNA COMPARACIÓN DE FECHAS: se evaluó deducirlo de
-- updated_at > alegra_invoiced_at y no sirve. updated_at se mueve por cualquier
-- cambio del pedido —prioridad, fecha de entrega, notas—, y ninguno de esos afecta
-- lo que dice la factura. El aviso saltaría solo, sin nada que actualizar, y un
-- aviso que aparece sin motivo se termina ignorando. La bandera la prenden
-- únicamente los tres caminos que tocan ÍTEMS, que es lo que la factura factura.
--
-- QUÉ SE MUESTRA: no alcanza con "algo cambió" —obliga a ir a buscar qué—. El
-- historial del pedido ya guarda cada cambio de ítem con su antes y después, así
-- que el aviso lo lee de ahí. Lo único que falta es desde cuándo contar: para eso
-- invoice_synced_at, que marca la última vez que la factura y el pedido estuvieron
-- de acuerdo. No sirve alegra_invoiced_at, que es cuándo se emitió y no se mueve
-- al actualizar.
--
-- QUÉ NO HACE: no reemite nada. La actualización es manual y explícita —se aprieta
-- un botón—, porque emitir contra la contabilidad no debe pasar de fondo. Esto solo
-- registra que hay diferencia.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/27-invoice-stale.sql
-- ============================================

-- TRUE = el pedido se modificó después de emitir la factura y la factura de Alegra
-- todavía no se puso al día. Vuelve a FALSE al actualizarla desde el pedido.
-- Los pedidos sin facturar quedan siempre en FALSE.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_stale BOOLEAN NOT NULL DEFAULT FALSE;

-- Última vez que la factura de Alegra quedó igual al pedido: al emitirla y en cada
-- actualización. Todo evento de ítem posterior a esta marca es una diferencia que
-- el aviso enumera.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_synced_at TIMESTAMP WITH TIME ZONE;

-- Los pedidos ya facturados arrancan sincronizados en su fecha de emisión: lo que
-- se haya tocado desde entonces se muestra como diferencia, que es la verdad.
UPDATE orders SET invoice_synced_at = alegra_invoiced_at
WHERE alegra_invoice_id IS NOT NULL AND invoice_synced_at IS NULL;
