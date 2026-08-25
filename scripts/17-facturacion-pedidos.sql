-- ============================================
-- Facturar un pedido en Alegra.
--
-- CONTEXTO: hasta ahora la app no facturaba; 'facturado' era solo una columna del
-- tablero y la factura se hacía a mano en Alegra. Esto agrega lo que hace falta
-- para emitirla desde el pedido.
--
-- LO QUE CAMBIA DE FONDO: el catálogo pasa a ser Alegra (ver 16-alegra-items.sql).
-- Un producto existe porque está allá, con su precio. La hoja de costo pasa a ser
-- opcional: sirve para explotar materiales, y si falta, el pedido sale sin lista
-- de materiales —que ya es el comportamiento de hoy— pero la facturación no se
-- entera. Eso es lo pedido explícitamente: que la falta de hoja de costo no
-- impida facturar.
--
-- DOS SEÑALES DISTINTAS, sin mezclarlas (el error que ya cometimos una vez con
-- needs_review y hubo que deshacer):
--   - needs_review    -> la línea no tiene lista de materiales. Sigue significando
--                        exactamente eso, y la UI del taller ya lo dice así.
--   - alegra_item_id  -> NULL significa que el producto no se encontró en el
--                        catálogo de Alegra: esa línea no se puede facturar.
-- Son problemas distintos, los resuelve gente distinta, y una línea puede tener
-- uno sin el otro.
--
-- AGREGADOS QUE FACTURAN APARTE: una estaca no cambia el producto, agrega un
-- renglón a la factura. spec_option_items mapea el valor de una spec al ítem de
-- Alegra que hay que sumar. Es distinto de budget_material_options (qué material
-- sale del depósito) y del match por variante (qué ítem representa al producto).
--
-- QUÉ TOCA ESTA MIGRACIÓN:
--   - Agrega UNA columna nullable a order_items (alegra_item_id).
--   - Agrega CUATRO columnas nullable a orders (datos de la factura emitida).
--   - Crea UNA tabla nueva (spec_option_items).
--   - Convierte el campo 'stake' de boolean a lista y siembra sus opciones: en
--     Alegra hay dos estacas vendibles con precios que difieren 3x ($2.940 la de
--     15cm y $9.926 la de 20cm), así que un sí/no no alcanza para facturar bien.
-- No borra filas ni reescribe datos existentes.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/17-facturacion-pedidos.sql
-- ============================================

-- Producto BASE del catálogo de Alegra al que resolvió esta línea. La variante
-- (el color) NO se guarda acá: se resuelve al facturar, contra el precio vigente.
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS alegra_item_id INTEGER;

-- Factura emitida desde este pedido. Se guarda el número además del id para
-- poder mostrarlo sin ir a buscarlo a Alegra.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS alegra_invoice_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS alegra_invoice_number VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS alegra_invoiced_at TIMESTAMP WITH TIME ZONE;
-- Qué no se pudo facturar y por qué, p. ej. ["Optic 9: no está en Alegra"].
-- Vacío = la factura salió completa.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_warnings JSONB NOT NULL DEFAULT '[]';

-- Valor de spec -> ítem de Alegra que se agrega como línea aparte.
CREATE TABLE IF NOT EXISTS spec_option_items (
    id SERIAL PRIMARY KEY,
    field_key VARCHAR(50) NOT NULL REFERENCES spec_fields(key) ON DELETE CASCADE,
    spec_value VARCHAR(100) NOT NULL,
    alegra_item_id INTEGER NOT NULL,
    -- Cuántas unidades por unidad de equipo. Una estaca por equipo = 1.
    qty_per_unit NUMERIC(10,2) NOT NULL DEFAULT 1,
    UNIQUE (field_key, spec_value)
);

-- ---------- 'stake' pasa de sí/no a lista ----------
-- Con un boolean el pedido dice que lleva estaca pero no cuál, y al facturar hay
-- que elegir entre dos productos que difieren 3x en precio. Cualquier default se
-- equivoca la mitad de las veces.
UPDATE spec_fields SET kind = 'list', free_text = FALSE WHERE key = 'stake';

-- 'con' y 'sin' quedan del vocabulario viejo. 'sin' se conserva (sigue siendo una
-- respuesta válida); 'con' se desactiva en vez de borrarse, para que los pedidos
-- históricos que lo usaron sigan siendo legibles.
UPDATE spec_options SET active = FALSE WHERE field_key = 'stake' AND value = 'con';

INSERT INTO spec_options (field_key, value, label, position) VALUES
    ('stake', 'sin', 'Sin estaca', 1),
    ('stake', '15cm', 'Estaca 15 cm negra', 2),
    ('stake', '20cm', 'Estaca 20 cm', 3)
ON CONFLICT (field_key, value) DO UPDATE SET label = EXCLUDED.label, active = TRUE;

CREATE INDEX IF NOT EXISTS idx_order_items_alegra_item ON order_items(alegra_item_id);
