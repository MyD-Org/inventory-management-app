-- Integración con Alegra (cotizaciones): columnas de vínculo.
-- - budgets.alegra_item_id: ítem de Alegra que representa este producto costeado
--   (se crea la primera vez que se cotiza y se reutiliza → sin duplicados).
-- - quotes.alegra_*: la cotización (estimate) creada en Alegra desde este presupuesto.

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS alegra_item_id INTEGER;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS alegra_estimate_id INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS alegra_estimate_number VARCHAR(50);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS alegra_contact_id INTEGER;
