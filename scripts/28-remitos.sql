-- ============================================
-- Remito del pedido en Alegra.
--
-- CONTEXTO: la factura se emite desde el pedido (17-facturacion-pedidos.sql). El
-- remito es el otro documento del mismo movimiento —qué mercadería sale del
-- depósito— y hasta ahora se hacía a mano en Alegra.
--
-- SON INDEPENDIENTES, EN CUALQUIER ORDEN. A veces sale primero el remito y se
-- factura después; a veces al revés. Ninguno de los dos es requisito del otro y
-- el pedido puede tener uno, el otro, los dos o ninguno.
--
-- EL REMITO VA EN CERO. Sus líneas se mandan con price 0, igual que los remitos
-- que ya hay en la cuenta: dice QUÉ sale, no cuánto vale. El módulo de pedidos es
-- deliberadamente sin plata para el taller, y el remito es el papel que más
-- circula por el depósito.
--
-- POR QUÉ NO SE USA LA RELACIÓN NATIVA DE ALEGRA: POST /invoices acepta
-- "remissions": [ids] y factura ese remito automáticamente. No sirve acá, y el
-- motivo es justamente el precio 0: Alegra toma las líneas DEL REMITO tal cual, así
-- que la factura saldría en cero. Se eligió que la plata esté siempre bien y
-- resignar el vínculo nativo. Los dos documentos se relacionan por el pedido —que
-- guarda los dos ids— y cada uno nombra al otro en sus observaciones.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/28-remitos.sql
-- ============================================

-- Remito emitido desde este pedido. Mismo criterio que la factura: se guarda el
-- número además del id para poder mostrarlo sin ir a buscarlo a Alegra.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS alegra_remission_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS alegra_remission_number VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS alegra_remitted_at TIMESTAMP WITH TIME ZONE;

-- Qué no entró en el remito y por qué, p. ej. ["Optic 9: no está en Alegra"].
-- Vacío = salió completo. Se guarda aparte de invoice_warnings: son dos
-- documentos distintos y pueden fallar por motivos distintos.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remission_warnings JSONB NOT NULL DEFAULT '[]';
