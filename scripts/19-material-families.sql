-- ============================================
-- Familias de materiales: el mapeo "valor de spec -> material" declarado UNA VEZ
-- en el inventario y reutilizado por todas las hojas de costo.
--
-- Contexto: 15-material-variants.sql resolvió QUÉ material sale del depósito
-- según lo que pidió el cliente, pero lo hizo por línea de hoja de costo. Como
-- TODOS los productos varían por color de LED, óptica y demás, ese mapeo hay que
-- recargarlo a mano en cada producto, y cambiar el material de un color obliga a
-- entrar producto por producto.
--
-- Una familia dice: "Tira LED varía según led_color; cálido es el material #12 y
-- azul el #13". En la hoja de costo se elige la familia y la línea queda armada
-- sola. El vínculo es VIVO: si mañana el azul pasa a ser otro material, todas las
-- hojas que usan la familia lo toman sin tocarlas.
--
-- QUÉ NO CAMBIA:
--   - El COSTEO. La línea sigue costeando con budget_materials.material_id /
--     unit_cost, que al elegir la familia se llenan con su variante
--     predeterminada. Todo lib/costed-products.ts, /costos y las tools de IA
--     siguen intactos.
--   - budget_material_options. Se sigue guardando el mapeo en la línea, también
--     cuando viene de una familia: es la FOTO de lo que se cargó. Si la familia
--     se borra, la hoja no se queda muda —sigue con su último mapeo conocido— y
--     las hojas cargadas a mano (sin familia) andan exactamente igual que hoy.
--     Al explotar el BOM manda la familia si la línea está vinculada; si no, la
--     foto.
--
-- POR QUÉ material_family_options NO GUARDA label: el nombre sale de
-- materials.name en cada lectura. Acá el material SIEMPRE existe (FK NOT NULL,
-- ON DELETE CASCADE), así que no hay nada que rotular a mano. Es la diferencia
-- con budget_material_options, que sí guarda label porque es una foto histórica.
--
-- POR QUÉ default_spec_value Y NO default_material_id: la predeterminada es
-- "con qué color se costea", y tiene que ser una de las variantes de la familia,
-- no un material suelto. Guardando el valor de spec eso es cierto por
-- construcción.
--
-- LIMITACIÓN HEREDADA: una familia varía por UN solo campo, igual que una línea
-- (ver 15-material-variants.sql). "Óptica de 25° en cuerpo negro" sigue pidiendo
-- líneas separadas.
--
-- QUÉ TOCA ESTA MIGRACIÓN:
--   - Crea DOS tablas nuevas (material_families, material_family_options).
--   - Agrega UNA columna nullable a budget_materials (family_id).
-- No reescribe filas existentes ni borra nada. Las hojas de costo actuales
-- quedan con family_id NULL, que es exactamente el comportamiento de hoy.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/19-material-families.sql
-- ============================================

CREATE TABLE IF NOT EXISTS material_families (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    -- Campo del vocabulario de specs que hace variar a la familia (led_color,
    -- clamp, ...). CASCADE: si se borra el campo, la familia deja de tener
    -- sentido —no queda "según qué" varía— y las líneas que la usaban vuelven a
    -- su foto propia por el ON DELETE SET NULL de budget_materials.family_id.
    spec_field_key VARCHAR(50) NOT NULL REFERENCES spec_fields(key) ON DELETE CASCADE,
    -- Con qué variante se costea. Nullable porque una familia recién creada
    -- todavía no tiene variantes; la UI la exige antes de poder usarla.
    default_spec_value VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS material_family_options (
    id SERIAL PRIMARY KEY,
    family_id INTEGER NOT NULL REFERENCES material_families(id) ON DELETE CASCADE,
    spec_value VARCHAR(100) NOT NULL,
    -- NOT NULL: una variante sin material no mapea nada. Para decir "este color
    -- no lo hacemos" se borra la fila, no se deja vacía.
    material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    UNIQUE (family_id, spec_value)
);

CREATE INDEX IF NOT EXISTS idx_material_family_options_family
    ON material_family_options(family_id);

-- Línea de hoja de costo vinculada a una familia. NULL = mapeo propio de la
-- línea (todo lo cargado hasta hoy).
-- SET NULL y no CASCADE: borrar una familia no puede borrar recetas. La línea
-- se queda con su foto en budget_material_options, que es lo último que se vio.
ALTER TABLE budget_materials
    ADD COLUMN IF NOT EXISTS family_id INTEGER REFERENCES material_families(id) ON DELETE SET NULL;
