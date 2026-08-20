-- ============================================
-- Pedidos automatizados desde el CRM (§3 de docs/pedidos-avantec.md).
--
-- El agente del CRM toma pedidos por chat y los crea vía POST /api/pedidos.
-- Necesita dos cosas que hoy no existen:
--
--   1) Un VOCABULARIO de opciones válidas (grampa, color de LED, óptica, color
--      de cuerpo) para no inventar valores. Vive en spec_fields/spec_options: el
--      equipo de inventario agrega opciones y el bot las descubre solo por
--      GET /api/specs.
--
--   2) Las tablas del pedido. El BOM de cada línea sale de la hoja de costo del
--      producto (budgets + budget_materials) y se COPIA al pedido como snapshot:
--      si mañana cambia la receta, el pedido ya despachado no se altera.
--
-- SIN CAMPOS DE PLATA, a propósito. El doc del CRM es explícito: "por este canal
-- no se habla de plata". El payload del bot no trae precios y el pedido no los
-- guarda. La facturación va por Alegra, aparte; acá 'facturado' es solo un
-- estado del tablero.
--
-- Las specs NO eligen la hoja de costo (hay una sola hoja por producto): son
-- instrucciones para el taller que viajan con la línea.
--
-- Todo aditivo: CREATE TABLE IF NOT EXISTS, sin ALTER ni UPDATE sobre tablas
-- existentes.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/14-pedidos.sql
-- ============================================

-- ---------- Vocabulario de opciones ----------

-- free_text: el campo 'other' del doc es texto libre, no una lista cerrada.
-- Para esos campos no validamos contra spec_options.
CREATE TABLE IF NOT EXISTS spec_fields (
    key VARCHAR(50) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    free_text BOOLEAN NOT NULL DEFAULT FALSE,
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

-- Numeración visible del pedido, separada del id interno: es la que ve el
-- cliente y la que devuelve la API como order_number.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 100;

-- external_id es la CLAVE DE IDEMPOTENCIA: el bot puede reintentar y siempre
-- recibe el mismo pedido, nunca un duplicado ni un error.
--
-- Estados = columnas del tablero del taller. Se guarda SIEMPRE el interno; la
-- API traduce a lenguaje de cliente (customer_status en lib/orders.ts) para no
-- filtrar la jerga interna.
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number INTEGER NOT NULL UNIQUE DEFAULT nextval('order_number_seq'),
    external_id VARCHAR(120) NOT NULL UNIQUE,
    origin VARCHAR(40) NOT NULL DEFAULT 'manual',
    customer_external_id VARCHAR(120) NOT NULL,
    customer_name VARCHAR(200),
    customer_phone VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'recibido'
        CHECK (status IN ('recibido', 'en_proceso', 'embalado', 'facturado',
                          'listo_para_retirar', 'retirado', 'cancelado')),
    priority VARCHAR(20) NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('baja', 'normal', 'alta')),
    delivery_date_estimate DATE,
    source_conversation VARCHAR(300),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- budget_id nullable: si el producto pedido no matchea ninguna hoja de costo, la
-- línea se guarda igual con needs_review = TRUE. No rechazamos el pedido por eso:
-- el taller lo resuelve a mano y el bot no queda trabado.
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    budget_id INTEGER REFERENCES budgets(id) ON DELETE SET NULL,
    product VARCHAR(300) NOT NULL,
    product_external_id VARCHAR(120),
    specs JSONB NOT NULL DEFAULT '{}',
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (order_id, line_no)
);

-- BOM explotado y congelado, copiado de budget_materials al crear el pedido.
-- unit_cost NO se copia: es información de costo y acá no va.
CREATE TABLE IF NOT EXISTS order_item_materials (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    label VARCHAR(300) NOT NULL,
    qty_per_unit DECIMAL(12,4) NOT NULL DEFAULT 0,
    qty_total DECIMAL(12,4) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_external_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_materials_item ON order_item_materials(order_item_id);

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- Vocabulario inicial ----------
-- Las CLAVES son el contrato con el bot (doc del CRM: clamp, led_color, optic,
-- body_color, other). No cambiarlas sin coordinar del otro lado. Las etiquetas y
-- las opciones se editan libremente desde /pedidos/opciones — ese es el punto
-- del módulo.
--
-- 'optic' (grados): los que hay en la categoría Opticas del inventario (8, 25,
-- 30, 45) más los que se consiguen a pedido (10, 15, 60, 90, 100). Ojo: los
-- grados solos no identifican el material — hay tres ópticas de 25° distintas.
--
-- 'other' es texto libre (así viene en el doc), no valida contra una lista.

INSERT INTO spec_fields (key, label, free_text, position) VALUES
    ('clamp', 'Grampa', FALSE, 1),
    ('led_color', 'Color de LED', FALSE, 2),
    ('optic', 'Óptica (grados)', FALSE, 3),
    ('body_color', 'Color del cuerpo', FALSE, 4),
    ('other', 'Otras indicaciones', TRUE, 5)
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
    ('body_color', 'negro', 'Negro', 1),
    ('body_color', 'blanco', 'Blanco', 2),
    ('body_color', 'aluminio', 'Aluminio', 3),
    ('body_color', 'bronce', 'Bronce', 4),
    ('body_color', 'tornasolado', 'Tornasolado', 5)
ON CONFLICT (field_key, value) DO NOTHING;
