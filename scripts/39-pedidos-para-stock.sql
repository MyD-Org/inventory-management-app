-- Pedidos para stock: producción propia sin cliente. El alta web marca
-- for_stock y el pedido termina en "en_deposito" (fuera del tablero).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS for_stock BOOLEAN NOT NULL DEFAULT FALSE;
