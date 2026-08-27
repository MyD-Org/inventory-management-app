-- Modificación de pedidos por API y seguimiento de revisión de fecha.
-- Agrega timestamps para saber si un cambio por API todavía no fue revisado.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS delivery_date_verified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_orders_modified_at ON orders(modified_at);
