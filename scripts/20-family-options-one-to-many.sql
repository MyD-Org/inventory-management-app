-- ============================================
-- Familias de materiales: de "un color = un material" a "un color = muchos materiales".
--
-- Contexto: una misma variante (p. ej. led_color='calido') puede corresponder a
-- varios materiales del inventario (distintos proveedores, SKU o stock). La
-- familia sigue costeando con UNA opción por color (la marcada como default), pero
-- al retirar material el taller puede elegir cuál de las opciones saca del depósito.
--
-- QUÉ TOCA ESTA MIGRACIÓN:
--   - Quita la restricción UNIQUE (family_id, spec_value) de material_family_options.
--   - Agrega is_default para saber cuál material representa al color para costeo/BOM.
--   - Agrega family_id y spec_value a order_item_materials para reconstruir las
--     alternativas al momento de consumir.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/20-family-options-one-to-many.sql
-- ============================================

-- Quitar el UNIQUE anterior. Postgres lo nombró material_family_options_family_id_spec_value_key
-- porque se creó inline en CREATE TABLE con UNIQUE (family_id, spec_value).
ALTER TABLE material_family_options DROP CONSTRAINT IF EXISTS material_family_options_family_id_spec_value_key;

-- Cuál material representa al color. Solo puede haber un default por (family_id, spec_value).
ALTER TABLE material_family_options
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Las filas existentes eran las únicas opciones de su color, así que pasan a ser default.
UPDATE material_family_options SET is_default = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_family_options_default
    ON material_family_options(family_id, spec_value)
    WHERE is_default = TRUE;

-- Seguimiento del origen de cada línea de BOM explotado, para ofrecer las
-- alternativas vigentes al consumir stock. SET NULL: si se borra la familia, la
-- línea del pedido sigue existiendo y se comporta como material fijo.
ALTER TABLE order_item_materials
    ADD COLUMN IF NOT EXISTS family_id INTEGER REFERENCES material_families(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS spec_value VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_order_item_materials_family
    ON order_item_materials(family_id, spec_value);
