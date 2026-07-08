-- Presupuestos comerciales: cotizaciones para clientes que REUTILIZAN los costos de
-- fabricación ya calculados (tabla budgets). Concepto separado de "costos de fabricación":
-- acá se arma el precio al cliente (precio de venta por producto + descuento).

CREATE TABLE IF NOT EXISTS quotes (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    customer_name VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
    discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0, -- descuento global sobre el subtotal
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ítems del presupuesto. budget_id referencia el cálculo de costo de origen (nullable:
-- si se borra el cálculo, el ítem queda con su snapshot). label/unit_price son SNAPSHOT
-- al momento de cotizar (el costo o el margen pueden cambiar después sin alterar la cotización).
CREATE TABLE IF NOT EXISTS quote_items (
    id SERIAL PRIMARY KEY,
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    budget_id INTEGER REFERENCES budgets(id) ON DELETE SET NULL,
    label VARCHAR(300) NOT NULL,
    qty DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);

-- updated_at automático (reusa update_updated_at_column() de 01)
DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
