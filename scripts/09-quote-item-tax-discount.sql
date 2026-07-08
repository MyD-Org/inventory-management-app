-- Columnas por línea del presupuesto (diseño tipo factura):
--   reference    → referencia/SKU editable (snapshot; se precarga del producto).
--   discount_pct → descuento porcentual POR LÍNEA (reemplaza al descuento global de quotes).
--   tax_pct      → impuesto (IVA) porcentual libre POR LÍNEA.
-- El descuento global (quotes.discount_pct) queda en desuso: se guarda 0.
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS reference VARCHAR(120);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS discount_pct DECIMAL(6,2) NOT NULL DEFAULT 0;
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS tax_pct DECIMAL(6,2) NOT NULL DEFAULT 0;
