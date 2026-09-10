-- ============================================
-- Un pedido puede tener VARIOS remitos: la mercadería sale por partes.
--
-- CONTEXTO: hasta ahora el remito era uno solo y vivía en tres columnas de
-- `orders` (28-remitos.sql). Eso alcanzaba mientras el pedido saliera entero, y
-- por eso remitOrder era idempotente: emitir dos remitos del mismo pedido
-- significaba que la mercadería había salido dos veces.
--
-- LO QUE PASA EN EL DEPÓSITO ES OTRA COSA: de 10 luminarias se entregan 4 hoy
-- porque es lo que hay armado, y las 6 que faltan la semana que viene. Son dos
-- salidas de mercadería reales, con dos papeles distintos, y el pedido tiene que
-- poder decir cuánto de cada línea YA SE ENTREGÓ. Con el modelo viejo la única
-- salida era emitir el segundo remito a mano en Alegra —y ahí el pedido dejaba
-- de saber que la mercadería había salido—.
--
-- CÓMO QUEDA: cada remito emitido es una fila de order_remissions con sus líneas
-- en order_remission_items. Lo entregado de una línea es la suma de sus líneas de
-- remito, y lo pendiente es lo pedido menos lo entregado. Emitir un remito nuevo
-- entrega lo pendiente (o una parte, la que se elija).
--
-- LAS COLUMNAS VIEJAS DE `orders` NO SE BORRAN: pasan a ser el espejo del ÚLTIMO
-- remito emitido. Las leen el tablero, la lista y el selector de estado para saber
-- si ya salió algo, y siguen siendo ciertas: "el último remito de este pedido es
-- el A-0001". Borrarlas obligaría a tocar seis pantallas en la misma migración
-- para no ganar nada.
--
-- POR QUÉ SE CONGELA EL PRODUCTO EN LA LÍNEA DE REMITO: el remito es un documento
-- de la contabilidad real y dice qué salió del depósito ese día. Si después se
-- borra la línea del pedido, lo entregado no deja de haber salido. order_item_id
-- queda en NULL y el nombre sigue estando.
--
-- delivered_quantity ES UNA CACHÉ, no la verdad: la verdad es la suma de
-- order_remission_items. Está para que el tablero, la lista y el detalle no tengan
-- que agregar la tabla de líneas en cada consulta. Se recalcula entera después de
-- cada emisión (ver refreshDeliveredQuantities en lib/remissions.ts), así que un
-- desajuste se arregla solo con el próximo remito.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/41-remitos-parciales.sql
-- ============================================

-- ---------- Los remitos del pedido ----------
CREATE TABLE IF NOT EXISTS order_remissions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- Nullable por el mismo motivo que en `orders`: el remito se emite en Alegra
    -- y puede fallar la lectura del número aunque el documento exista.
    alegra_remission_id INTEGER,
    alegra_remission_number VARCHAR(50),
    remitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- Qué no entró en ESTE remito y por qué. Cada emisión falla por lo suyo.
    warnings JSONB NOT NULL DEFAULT '[]',
    -- Quién lo emitió. 'Sistema' cuando salió solo al pasar a "Preparando entrega".
    actor_name VARCHAR(200),
    actor_email VARCHAR(200)
);

-- ---------- Qué salió en cada remito ----------
CREATE TABLE IF NOT EXISTS order_remission_items (
    id SERIAL PRIMARY KEY,
    remission_id INTEGER NOT NULL REFERENCES order_remissions(id) ON DELETE CASCADE,
    -- ON DELETE SET NULL, no CASCADE: ver arriba. Lo que salió, salió.
    order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
    product VARCHAR(300) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_remissions_order ON order_remissions(order_id, remitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_remission_items_remission ON order_remission_items(remission_id);
CREATE INDEX IF NOT EXISTS idx_order_remission_items_item ON order_remission_items(order_item_id);

-- ---------- Lo entregado de cada línea ----------
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS delivered_quantity DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ---------- Los remitos que ya había ----------
-- Cada pedido con remito pasa a tener UN remito con todas sus líneas completas:
-- es lo que decía ese documento, porque hasta hoy el remito salía entero o no
-- salía. Idempotente: si la migración se corre dos veces no duplica nada.
INSERT INTO order_remissions (order_id, alegra_remission_id, alegra_remission_number, remitted_at, warnings, actor_name)
SELECT o.id, o.alegra_remission_id, o.alegra_remission_number,
       COALESCE(o.alegra_remitted_at, o.updated_at, NOW()), o.remission_warnings, 'Sistema'
FROM orders o
WHERE o.alegra_remission_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM order_remissions r WHERE r.order_id = o.id);

INSERT INTO order_remission_items (remission_id, order_item_id, product, quantity)
SELECT r.id, i.id, i.product, i.quantity
FROM order_remissions r
JOIN order_items i ON i.order_id = r.order_id
WHERE NOT EXISTS (SELECT 1 FROM order_remission_items ri WHERE ri.remission_id = r.id);

-- Y la caché al día con lo recién insertado.
UPDATE order_items i
SET delivered_quantity = COALESCE((
    SELECT SUM(ri.quantity) FROM order_remission_items ri WHERE ri.order_item_id = i.id
), 0);
