-- ============================================
-- Pedidos automatizados desde el CRM (§3 de docs/pedidos-avantec.md).
--
-- Contexto: el agente del CRM toma pedidos por chat y los crea acá vía
-- POST /api/pedidos. Necesita dos cosas que hoy no existen:
--
--   1) Un VOCABULARIO de opciones válidas (grampa, color de LED, óptica,
--      color) para no inventar valores. Vive en spec_fields/spec_options:
--      el equipo de inventario agrega opciones acá y el bot las descubre
--      solo vía GET /api/specs.
--
--   2) Las tablas del pedido. El BOM de cada línea sale de la hoja de costo
--      del producto (budgets + budget_materials) y se COPIA al pedido como
--      snapshot, igual que hace quote_items con el precio: si mañana cambia
--      la receta o el costo, el pedido ya despachado no se altera.
--
-- Las specs NO eligen la hoja de costo (hay una sola hoja por producto):
-- son instrucciones para el taller que viajan con la línea.
--
-- Todo es aditivo: CREATE TABLE IF NOT EXISTS, sin ALTER ni UPDATE sobre
-- tablas existentes.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/14-pedidos.sql
-- ============================================

-- ---------- Vocabulario de opciones ----------

CREATE TABLE IF NOT EXISTS spec_fields (
    key VARCHAR(50) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS spec_options (
    id SERIAL PRIMARY KEY,
    field_key VARCHAR(50) NOT NULL REFERENCES spec_fields(key) ON DELETE CASCADE,
    value VARCHAR(80) NOT NULL,
    label VARCHAR(120),
    position INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (field_key, value)
);

CREATE INDEX IF NOT EXISTS idx_spec_options_field ON spec_options(field_key);

-- ---------- Pedidos ----------

-- external_id es la CLAVE DE IDEMPOTENCIA: el bot puede reintentar el mismo
-- pedido y siempre recibe el mismo registro, nunca un duplicado ni un error.
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(120) NOT NULL UNIQUE,
    customer_external_id VARCHAR(120) NOT NULL,
    customer_name VARCHAR(200),
    status VARCHAR(30) NOT NULL DEFAULT 'recibido'
        CHECK (status IN ('recibido', 'en_produccion', 'listo', 'entregado', 'cancelado')),
    source_conversation VARCHAR(300),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- budget_id nullable: si el producto pedido no matchea ninguna hoja de costo,
-- la línea se guarda igual con needs_review = TRUE. No rechazamos el pedido
-- por eso: el taller lo resuelve a mano y el bot no queda trabado.
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    budget_id INTEGER REFERENCES budgets(id) ON DELETE SET NULL,
    label VARCHAR(300) NOT NULL,
    specs JSONB NOT NULL DEFAULT '{}',
    qty DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (order_id, line_no)
);

-- BOM explotado y congelado, copiado de budget_materials al crear el pedido.
CREATE TABLE IF NOT EXISTS order_item_materials (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    label VARCHAR(300) NOT NULL,
    qty_per_unit DECIMAL(12,4) NOT NULL DEFAULT 0,
    qty_total DECIMAL(12,4) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_external_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_materials_item ON order_item_materials(order_item_id);

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- Vocabulario inicial ----------
-- 'clamp' y 'led_color' salen del doc del CRM: son el contrato con el bot,
-- no cambiar las CLAVES sin coordinar del otro lado. Las etiquetas y las
-- opciones sí se editan libremente desde acá (es el punto del módulo).
--
-- 'optic' (grados) = los que hay hoy en la categoría Opticas del inventario
-- (8, 25, 30, 45) MÁS los que se consiguen a pedido (10, 15, 60, 90, 100).
-- Ojo: los grados solos no identifican el material — hay tres ópticas de 25°
-- distintas (individual Darkoo, individual Darkoo SG, 2x2 Ledil). El taller
-- todavía elige cuál al fabricar.
--
-- 'color' = las terminaciones que aparecen en los materiales del inventario.
--
-- Para agregar o sacar una opción NO hace falta tocar código: un INSERT acá, o
-- UPDATE spec_options SET active = FALSE. Desactivar la saca del vocabulario
-- sin romper los pedidos históricos que ya la usaron.

INSERT INTO spec_fields (key, label, position) VALUES
    ('clamp', 'Grampa', 1),
    ('led_color', 'Color de LED', 2),
    ('optic', 'Óptica (grados)', 3),
    ('color', 'Color', 4)
ON CONFLICT (key) DO NOTHING;

INSERT INTO spec_options (field_key, value, label, position) VALUES
    ('clamp', 'larga', 'Larga', 1),
    ('clamp', 'corta', 'Corta', 2),
    ('led_color', 'blanco', 'Blanco', 1),
    ('led_color', 'calido', 'Cálido', 2),
    ('led_color', 'neutro', 'Neutro', 3),
    ('led_color', 'rgb', 'RGB', 4),
    ('optic', '8', '8°', 1),
    ('optic', '10', '10°', 2),
    ('optic', '15', '15°', 3),
    ('optic', '25', '25°', 4),
    ('optic', '30', '30°', 5),
    ('optic', '45', '45°', 6),
    ('optic', '60', '60°', 7),
    ('optic', '90', '90°', 8),
    ('optic', '100', '100°', 9),
    ('color', 'negro', 'Negro', 1),
    ('color', 'blanco', 'Blanco', 2),
    ('color', 'aluminio', 'Aluminio', 3),
    ('color', 'bronce', 'Bronce', 4),
    ('color', 'tornasolado', 'Tornasolado', 5)
ON CONFLICT (field_key, value) DO NOTHING;
