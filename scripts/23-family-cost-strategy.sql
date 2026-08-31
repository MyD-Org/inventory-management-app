-- Estrategia de costeo para familias de materiales.
-- Antes el costo siempre salía del material default de la variante default.
-- Ahora el usuario puede elegir: default, average, highest o specific.

ALTER TABLE material_families
    ADD COLUMN cost_strategy TEXT NOT NULL DEFAULT 'default',
    ADD COLUMN cost_material_id INTEGER REFERENCES materials(id);

-- Garantiza que solo se guarden estrategias válidas.
ALTER TABLE material_families
    ADD CONSTRAINT material_families_cost_strategy_check
    CHECK (cost_strategy IN ('default', 'average', 'highest', 'specific'));

-- Si la estrategia es 'specific', debe haber un material de costeo elegido.
ALTER TABLE material_families
    ADD CONSTRAINT material_families_specific_requires_material
    CHECK (
        cost_strategy <> 'specific'
        OR cost_material_id IS NOT NULL
    );
