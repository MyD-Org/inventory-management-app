-- ============================================
-- Espejo de los productos (items) de Alegra.
--
-- POR QUÉ: hasta ahora un producto "existía" si tenía hoja de costo (budgets), y
-- el ítem de Alegra se creaba recién al cotizar. Eso deja un hueco: si nunca se
-- cotizó, al facturar el producto no está del otro lado. Y obliga a mantener dos
-- catálogos en paralelo — tres, contando los nombres sueltos que manda el bot.
--
-- Se invierte quién manda: el catálogo es ALEGRA. Un producto existe porque está
-- ahí, con su precio. La hoja de costo pasa a ser información opcional que se le
-- cuelga a un producto para saber cómo se fabrica y cuánto cuesta; si falta, el
-- pedido sale sin lista de materiales (comportamiento actual) pero la facturación
-- no se entera.
--
-- CÓMO SE GUARDAN LAS VARIANTES: en Alegra el color del LED genera productos
-- distintos, con el nombre "Producto / Color" ("Optic 1 12-24v / Azul"). Medido
-- sobre la cuenta real: 1704 ítems, 523 con variante, 48 productos base y ~14
-- colores que se repiten entre ellos.
--
-- Guardamos el nombre partido en base + variante para poder resolver las dos
-- direcciones que hacen falta:
--   - El PEDIDO habla de producto y color por separado (el taller necesita leer
--     "Optic 1" y "azul" en columnas distintas).
--   - La FACTURA necesita el ítem combinado.
-- Con base_normalized + variant_normalized el match es exacto y sin adivinar.
--
-- Los campos *_normalized son sin tildes ni mayúsculas: en el catálogo conviven
-- "Blanco calido" y "Blanco cálido", y el match tiene que encontrarlos igual.
--
-- OJO CON EL PRECIO: se verificó que las 48 familias tienen UN SOLO precio para
-- todas sus variantes, sin excepciones. Por eso, si no se encuentra el color
-- pedido, facturar el ítem base cobra exactamente lo mismo.
--
-- QUÉ TOCA ESTA MIGRACIÓN:
--   - Crea UNA tabla nueva (alegra_items) y sus índices.
-- No toca ninguna tabla existente.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/16-alegra-items.sql
-- ============================================

CREATE TABLE IF NOT EXISTS alegra_items (
    id SERIAL PRIMARY KEY,
    alegra_id INTEGER NOT NULL UNIQUE,
    name VARCHAR(400) NOT NULL,
    -- Nombre completo normalizado, para buscar por el nombre tal cual figura.
    name_normalized VARCHAR(400) NOT NULL,
    -- Lo de antes de " / ". Si el ítem no tiene variante, es el nombre entero.
    base_name VARCHAR(400) NOT NULL,
    base_normalized VARCHAR(400) NOT NULL,
    -- Lo de después de " / ". NULL = el ítem no es una variante.
    variant_label VARCHAR(200),
    variant_normalized VARCHAR(200),
    price NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- 'active' / 'inactive' en Alegra. No se borran los inactivos: pueden estar
    -- referenciados por facturas históricas.
    status VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resolver "producto + color" al facturar, y "producto base" al tomar el pedido.
CREATE INDEX IF NOT EXISTS idx_alegra_items_base ON alegra_items(base_normalized);
CREATE INDEX IF NOT EXISTS idx_alegra_items_variant ON alegra_items(base_normalized, variant_normalized);
CREATE INDEX IF NOT EXISTS idx_alegra_items_name ON alegra_items(name_normalized);

DROP TRIGGER IF EXISTS update_alegra_items_updated_at ON alegra_items;
CREATE TRIGGER update_alegra_items_updated_at BEFORE UPDATE ON alegra_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
