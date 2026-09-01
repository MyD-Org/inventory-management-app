-- ============================================
-- El mismo aviso de "quedó desactualizado", ahora también para el remito.
--
-- CONTEXTO: 27-invoice-stale.sql agregó invoice_stale / invoice_synced_at para
-- avisar cuando el pedido cambia después de facturar. El remito tiene exactamente
-- el mismo problema —dice qué mercadería sale, y si el pedido cambia deja de ser
-- cierto— así que lleva el mismo par de columnas en vez de una solución distinta.
--
-- DOS BANDERAS Y NO UNA COMPARTIDA: los documentos se emiten por separado y en
-- cualquier orden. Un pedido puede tener la factura al día y el remito viejo, o al
-- revés, y cada uno se actualiza solo. Una bandera común obligaría a actualizar los
-- dos para poder apagarla.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/29-remito-stale.sql
-- ============================================

-- TRUE = el pedido se modificó después de emitir el remito y el remito de Alegra
-- todavía no se puso al día. Vuelve a FALSE al actualizarlo desde el pedido.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remission_stale BOOLEAN NOT NULL DEFAULT FALSE;

-- Última vez que el remito quedó igual al pedido: al emitirlo y en cada
-- actualización. Todo evento de ítem posterior es una diferencia que el aviso lista.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remission_synced_at TIMESTAMP WITH TIME ZONE;

-- Los pedidos ya remitidos arrancan sincronizados en su fecha de emisión.
UPDATE orders SET remission_synced_at = alegra_remitted_at
WHERE alegra_remission_id IS NOT NULL AND remission_synced_at IS NULL;
