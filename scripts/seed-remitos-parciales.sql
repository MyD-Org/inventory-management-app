-- ============================================
-- DATOS DE PRUEBA para ver las entregas parciales en pantalla. NO es una
-- migración: no cambia el esquema y solo escribe tres pedidos de ejemplo.
--
-- Deja los tres estados de entrega uno al lado del otro, que es lo que hace falta
-- para mirar el front:
--
--   #A "Obra Costanera (demo)"  -> ENTREGA PARCIAL, con DOS remitos.
--        10 Optic 9  : 4 entregadas (2 en cada remito)
--         6 Optic 25 : entregadas completas en el segundo remito
--         8 Estacas  : sin entregar
--   #B "Ferretería del Puerto (demo)" -> ENTREGADO, un remito por todo.
--   #C "Municipalidad (demo)"         -> SIN ENTREGAR, ningún remito.
--
-- Requiere haber corrido antes scripts/41-remitos-parciales.sql.
--
-- Correr local (Postgres del docker de docs/local-dev.md):
--   docker exec -i ai-api-pg psql -U postgres -d avantec < scripts/seed-remitos-parciales.sql
--
-- Es IDEMPOTENTE: borra sus propios pedidos por external_id antes de crearlos, así
-- que se puede correr las veces que haga falta sin ensuciar la base.
--
-- OJO CON EMITIR DE VERDAD desde estos pedidos: el cliente es "manual:", así que
-- el diálogo va a avisar que no está en Alegra y el botón queda apagado. Los
-- PRODUCTOS sí se siembran en el espejo del catálogo (alegra_items), para que el
-- panel "Qué va a decir el remito" muestre los renglones de verdad y se pueda ver
-- cómo se recortan al cambiar las cantidades. Están para MIRAR cómo quedó la
-- pantalla, no para emitir: eso necesita las credenciales de Alegra.
-- ============================================

-- ---------- Limpieza de la corrida anterior ----------
-- El ON DELETE CASCADE se lleva ítems, remitos, líneas de remito y eventos.
DELETE FROM orders WHERE external_id IN (
    'demo-entrega-parcial', 'demo-entrega-completa', 'demo-sin-entregar'
);

-- ---------- Los pedidos ----------
INSERT INTO orders (
    external_id, origin, customer_external_id, customer_name, customer_phone,
    status, priority, delivery_date_estimate, reference, notes
)
VALUES
    ('demo-entrega-parcial', 'manual', 'manual:Obra Costanera', 'Obra Costanera (demo)',
     '11 5000-0001', 'por_facturar', 'alta', CURRENT_DATE + 7, 'OC-2291',
     'Ejemplo de entrega por partes: salieron dos remitos y todavía queda material adentro.'),
    ('demo-entrega-completa', 'manual', 'manual:Ferreteria del Puerto', 'Ferretería del Puerto (demo)',
     '11 5000-0002', 'listo_para_retirar', 'normal', CURRENT_DATE + 2, NULL,
     'Ejemplo de pedido entregado completo en un solo remito.'),
    ('demo-sin-entregar', 'manual', 'manual:Municipalidad', 'Municipalidad (demo)',
     '11 5000-0003', 'por_facturar', 'normal', CURRENT_DATE + 14, NULL,
     'Ejemplo de pedido sin remitir: el tablero lo marca "Falta emitir el remito".');

-- ---------- El espejo del catálogo de Alegra ----------
-- Sin estas filas ninguna línea se resuelve y el diálogo de remitir sale lleno de
-- avisos en vez de mostrar lo que diría el papel. Los alegra_id son inventados.
INSERT INTO alegra_items (alegra_id, name, name_normalized, base_name, base_normalized, price, status)
VALUES
    (990001, 'Optic 9 12-24v',  'optic 9 12-24v',  'Optic 9 12-24v',  'optic 9 12-24v',  48000, 'active'),
    (990002, 'Optic 25 12-24v', 'optic 25 12-24v', 'Optic 25 12-24v', 'optic 25 12-24v', 52000, 'active'),
    (990003, 'Optic 1 12-24v',  'optic 1 12-24v',  'Optic 1 12-24v',  'optic 1 12-24v',  41000, 'active'),
    (990004, 'Estaca corta',    'estaca corta',    'Estaca corta',    'estaca corta',     6500, 'active'),
    (990005, 'Estaca larga',    'estaca larga',    'Estaca larga',    'estaca larga',     8900, 'active')
ON CONFLICT (alegra_id) DO NOTHING;

-- ---------- Las líneas ----------
-- needs_review en FALSE a mano: sin hoja de costo la app lo pondría en TRUE y la
-- fila saldría con el aviso de "sin lista de materiales", que acá es ruido.
INSERT INTO order_items (order_id, line_no, product, specs, quantity, needs_review, alegra_item_id)
SELECT o.id, d.line_no, d.product, '{}'::jsonb, d.quantity, FALSE,
       (SELECT a.alegra_id FROM alegra_items a WHERE a.base_name = d.product)
FROM (VALUES
    ('demo-entrega-parcial',  1, 'Optic 9 12-24v',  10),
    ('demo-entrega-parcial',  2, 'Optic 25 12-24v',  6),
    ('demo-entrega-parcial',  3, 'Estaca corta',     8),
    ('demo-entrega-completa', 1, 'Optic 1 12-24v',   5),
    ('demo-sin-entregar',     1, 'Optic 9 12-24v',   4),
    ('demo-sin-entregar',     2, 'Estaca larga',     4)
) AS d(external_id, line_no, product, quantity)
JOIN orders o ON o.external_id = d.external_id;

-- ---------- Los remitos emitidos ----------
-- Los ids y números de Alegra son inventados: en la pantalla se ven igual y el
-- link queda muerto, que es lo esperable en una base de prueba.
INSERT INTO order_remissions (
    order_id, alegra_remission_id, alegra_remission_number, remitted_at, warnings, actor_name
)
SELECT o.id, d.alegra_id, d.numero, NOW() - d.hace, '[]'::jsonb, d.actor
FROM (VALUES
    ('demo-entrega-parcial',  900001, 'R-0001', INTERVAL '6 days', 'Dalila'),
    ('demo-entrega-parcial',  900002, 'R-0002', INTERVAL '2 days', 'Dalila'),
    ('demo-entrega-completa', 900003, 'R-0003', INTERVAL '1 day',  'Sistema')
) AS d(external_id, alegra_id, numero, hace, actor)
JOIN orders o ON o.external_id = d.external_id;

-- ---------- Qué salió en cada remito ----------
INSERT INTO order_remission_items (remission_id, order_item_id, product, quantity)
SELECT r.id, i.id, i.product, d.quantity
FROM (VALUES
    ('R-0001', 1, 2),   -- primera entrega: 2 de las 10 Optic 9
    ('R-0002', 1, 2),   -- segunda: otras 2 Optic 9...
    ('R-0002', 2, 6),   -- ...y las 6 Optic 25 completas
    ('R-0003', 1, 5)
) AS d(numero, line_no, quantity)
JOIN order_remissions r ON r.alegra_remission_number = d.numero
JOIN order_items i ON i.order_id = r.order_id AND i.line_no = d.line_no;

-- ---------- La caché de lo entregado ----------
-- Lo mismo que hace refreshDeliveredQuantities después de cada emisión.
UPDATE order_items i
SET delivered_quantity = COALESCE((
    SELECT SUM(ri.quantity) FROM order_remission_items ri WHERE ri.order_item_id = i.id
), 0)
WHERE i.order_id IN (SELECT id FROM orders WHERE external_id LIKE 'demo-%');

-- ---------- El espejo del último remito en `orders` ----------
UPDATE orders o
SET alegra_remission_id = u.alegra_remission_id,
    alegra_remission_number = u.alegra_remission_number,
    alegra_remitted_at = u.remitted_at,
    remission_synced_at = u.remitted_at
FROM (
    SELECT DISTINCT ON (order_id) order_id, alegra_remission_id, alegra_remission_number, remitted_at
    FROM order_remissions ORDER BY order_id, remitted_at DESC, id DESC
) AS u
WHERE o.id = u.order_id AND o.external_id LIKE 'demo-%';

-- ---------- El hilo de actividad ----------
INSERT INTO order_events (order_id, actor_name, kind, field, new_value, body, created_at)
SELECT o.id, 'Sistema', 'created', 'origin', 'manual', NULL, NOW() - INTERVAL '10 days'
FROM orders o WHERE o.external_id LIKE 'demo-%';

-- El remito con cuánto quedó entregado después de él, igual que lo escribe la app.
INSERT INTO order_events (order_id, actor_name, kind, field, new_value, body, created_at)
SELECT r.order_id, COALESCE(r.actor_name, 'Sistema'), 'invoice', 'remito',
       r.alegra_remission_number, d.resumen, r.remitted_at
FROM (VALUES
    ('R-0001', '2 de 24 entregadas'),
    ('R-0002', '10 de 24 entregadas'),
    ('R-0003', '5 de 5 entregadas')
) AS d(numero, resumen)
JOIN order_remissions r ON r.alegra_remission_number = d.numero;
