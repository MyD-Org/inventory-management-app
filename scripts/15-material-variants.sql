-- ============================================
-- Variantes de materiales en las hojas de costo.
--
-- Contexto: un mismo producto se fabrica con materias primas distintas según lo
-- que pida el cliente. Un Optic 1 puede llevar tira LED cálida o azul; una
-- grampa corta o larga. Son materiales distintos, con precios distintos, pero el
-- producto SE COBRA IGUAL: el color no cambia el precio de venta.
--
-- Hasta ahora cada línea de budget_materials apuntaba a UN material fijo, así que
-- al armar la hoja de costo había que elegir un color y el resto de las variantes
-- no existía en ninguna parte. Eso rompía dos cosas distintas:
--
--   1) El COSTEO quedaba atado al material que se hubiera elegido al cargar.
--   2) El DESCUENTO DE STOCK descontaba siempre ese material, sin mirar el pedido.
--
-- El punto 2 es exactamente la limitación conocida que documenta 14-pedidos.sql
-- (líneas 24-33): un pedido con clamp='larga' arrastra la grampa que tenga
-- cargada la hoja, y missing_materials marca faltante del material equivocado.
-- Ese comentario proponía "una tabla de sustitución (field_key, value) ->
-- material_id". Esto es esa tabla.
--
-- CÓMO QUEDA:
--   - La línea sigue apuntando a un MATERIAL DE REFERENCIA en
--     budget_materials.material_id / unit_cost. Ese, y solo ese, define el costo
--     de la línea. Por eso todo el cálculo de costo existente (los SUM(qty *
--     unit_cost) repartidos por lib/costed-products.ts, /costos y las tools de
--     IA) sigue funcionando sin tocar una coma.
--   - budget_material_options mapea cada valor del vocabulario de specs
--     (led_color='calido', clamp='larga', ...) al material que corresponde.
--     Se usa al explotar el BOM del pedido, NO para costear.
--   - Las variantes NO llevan costo propio, igual que order_item_materials
--     deliberadamente no copia costos: acá no se habla de plata por variante.
--
-- POR QUÉ spec_value NO TIENE FK a spec_options(field_key, value): el vocabulario
-- se edita libremente desde /pedidos/opciones. Si alguien borra una opción, el
-- mapeo queda huérfano pero no rompe el guardado de la hoja de costo ni el alta
-- de pedidos; la UI del editor lo muestra como fila a revisar. Preferimos un dato
-- viejo visible antes que un DELETE que falla o que borra receta en cascada.
--
-- LIMITACIÓN CONOCIDA: una línea varía por UN solo campo. No se puede expresar
-- "óptica de 25° en cuerpo negro" como un material distinto de "óptica de 25° en
-- cuerpo blanco" (combinación de dos campos). Si aparece el caso, se resuelve con
-- líneas separadas o con un producto aparte.
--
-- QUÉ TOCA ESTA MIGRACIÓN:
--   - Agrega UNA columna nullable a budget_materials (spec_field_key).
--   - Agrega UNA columna a order_items (unmapped_specs, default '[]').
--   - Crea UNA tabla nueva (budget_material_options) y su índice.
-- No reescribe filas existentes ni borra nada. Las hojas de costo actuales
-- quedan con spec_field_key NULL, que es exactamente el comportamiento de hoy.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/15-material-variants.sql
-- ============================================

-- Qué campo del vocabulario de specs hace variar esta línea.
-- NULL = material fijo (el caso de la enorme mayoría de las líneas).
ALTER TABLE budget_materials
    ADD COLUMN IF NOT EXISTS spec_field_key VARCHAR(50) REFERENCES spec_fields(key) ON DELETE SET NULL;

-- Sustitución spec_value -> material. El material de REFERENCIA no vive acá: es
-- el budget_materials.material_id de la línea, y es el único que define el costo.
CREATE TABLE IF NOT EXISTS budget_material_options (
    id SERIAL PRIMARY KEY,
    budget_material_id INTEGER NOT NULL REFERENCES budget_materials(id) ON DELETE CASCADE,
    spec_value VARCHAR(100) NOT NULL,
    material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    label VARCHAR(300) NOT NULL,
    UNIQUE (budget_material_id, spec_value)
);

CREATE INDEX IF NOT EXISTS idx_budget_material_options_line
    ON budget_material_options(budget_material_id);

-- Qué pidió el pedido que la hoja de costo no sabe resolver, p. ej. ["clamp=media"].
-- Vacío = todo mapeado.
--
-- Columna PROPIA y no needs_review: esa bandera ya significa "esta línea no tiene
-- lista de materiales, hay que descontar a mano" (así la nombra la UI del taller).
-- Una spec sin mapear es lo contrario: el BOM se explotó completo, con el material
-- de referencia, y lo que hay que revisar es si ese material es el correcto.
-- Mezclarlas le haría decir a la vista del pedido que no hay materiales cuando sí
-- los hay, y el taller podría terminar descontando dos veces.
--
-- La reescribe explodeBom en CADA explosión, así que corregir las specs la limpia
-- sola: es un hecho derivado del pedido, no una marca que alguien tenga que apagar.
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS unmapped_specs JSONB NOT NULL DEFAULT '[]';
