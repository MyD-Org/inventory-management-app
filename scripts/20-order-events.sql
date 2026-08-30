-- ============================================
-- Historia del pedido: quién hizo cada cambio y las notas del taller.
--
-- Una sola tabla para las dos cosas. En la vista se leen juntas, ordenadas por
-- hora: separarlas en dos tablas obligaría a mezclarlas al leer, y una nota y
-- un cambio de estado son lo mismo para quien reconstruye qué pasó.
--
-- Aplicar en prod: node scripts/run-sql.js scripts/20-order-events.sql
-- ============================================

CREATE TABLE IF NOT EXISTS order_events (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

    -- Quién. Se guarda el NOMBRE, no solo el id: si mañana se borra el usuario,
    -- la historia tiene que seguir diciendo quién lo hizo.
    -- Para lo que no hace una persona: 'Bot de WhatsApp', 'Sistema'.
    actor_name TEXT NOT NULL,
    actor_email TEXT,

    kind TEXT NOT NULL CHECK (kind IN (
        'created', 'status', 'field', 'item_added', 'item_updated',
        'item_removed', 'materials_consumed', 'invoice', 'note'
    )),

    -- Qué campo cambió y de qué a qué. Los tres van juntos o ninguno.
    field TEXT,
    old_value TEXT,
    new_value TEXT,

    -- Solo para kind = 'note'.
    body TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La vista pide todos los eventos de UN pedido, del más nuevo al más viejo.
CREATE INDEX IF NOT EXISTS order_events_order_idx
    ON order_events (order_id, created_at DESC);

-- Las notas que ya existen pasan a ser el primer evento del pedido. El autor es
-- desconocido: nadie lo guardó hasta ahora, y poner el nombre de quien corre la
-- migración sería inventar un dato.
--
-- Se fecha con la creación del pedido, no con NOW(): la nota es vieja y en el
-- hilo tiene que aparecer donde corresponde, no arriba de todo.
--
-- btrim con la lista de caracteres y no TRIM a secas: TRIM saca espacios pero
-- NO saltos de línea, así que una nota con un "\n" suelto se colaba como nota
-- real y aparecía en el hilo como un recuadro vacío firmado por Desconocido.
INSERT INTO order_events (order_id, actor_name, kind, body, created_at)
SELECT o.id, 'Desconocido', 'note', o.notes, o.created_at
FROM orders o
WHERE o.notes IS NOT NULL
  AND btrim(o.notes, E' \t\r\n') <> ''
  AND NOT EXISTS (
      SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'note'
  );

-- Los pedidos que ya existían no tienen evento de creación. Se agrega uno con
-- el origen que quedó registrado, así ninguna historia empieza en el aire.
INSERT INTO order_events (order_id, actor_name, kind, new_value, created_at)
SELECT o.id,
       CASE WHEN o.origin = 'whatsapp' THEN 'Bot de WhatsApp' ELSE 'Desconocido' END,
       'created', o.origin, o.created_at
FROM orders o
WHERE NOT EXISTS (
    SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'created'
);

-- Limpieza de las notas en blanco que entraron con la primera versión de esta
-- migración, que filtraba con TRIM. Correr el archivo de nuevo las borra.
DELETE FROM order_events
WHERE kind = 'note' AND btrim(COALESCE(body, ''), E' \t\r\n') = '';
