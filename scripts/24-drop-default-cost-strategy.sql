-- Saca la estrategia de costeo 'default' de las familias de materiales.
--
-- 'default' costeaba con el material de la variante predeterminada, que es
-- simplemente la primera que se cargó: nadie la elige a propósito. Peor, si ese
-- material no tenía costo cargado la familia entera costeaba en CERO sin avisar
-- (pasaba con "Placa 3 led" y "Placa de 1 led", las dos en $0). Las otras tres
-- estrategias son explícitas y cubren todos los casos.
--
-- Las familias existentes pasan a 'average': es el que refleja la mezcla real de
-- variantes. Los costos ya guardados en las hojas NO se tocan: se actualizan
-- cuando alguien aprieta "Actualizar precios", como cualquier otra línea.

UPDATE material_families
SET cost_strategy = 'average'
WHERE cost_strategy = 'default';

-- El default de la columna tenía que dejar de ser un valor que ya no existe.
ALTER TABLE material_families
    ALTER COLUMN cost_strategy SET DEFAULT 'average';

-- El CHECK todavía aceptaba 'default': sin esto, una escritura vieja podría
-- volver a meterlo y la UI no sabría representarlo.
ALTER TABLE material_families
    DROP CONSTRAINT IF EXISTS material_families_cost_strategy_check;

ALTER TABLE material_families
    ADD CONSTRAINT material_families_cost_strategy_check
    CHECK (cost_strategy IN ('average', 'highest', 'specific'));
