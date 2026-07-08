-- Descripción por ítem del presupuesto (snapshot; se precarga del producto costeado
-- pero es editable y se muestra en el PDF debajo del nombre del producto).
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS description TEXT;
