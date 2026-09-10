-- ============================================
-- Operarios: quién movió el stock, además de desde qué cuenta.
--
-- EL PROBLEMA: stock_movements.user_name sale de la sesión (auth()), o sea que
-- identifica la CUENTA, no a la PERSONA. En el depósito hay una tablet con un
-- login abierto todo el día que nadie va a cerrar y volver a abrir para sacar
-- tres tornillos, así que todos los movimientos quedaban firmados con el mismo
-- nombre y el histórico no servía para saber quién retiró qué.
--
-- CÓMO SE SEPARA: user_name NO SE TOCA y sigue siendo la autenticación (quién
-- tenía permiso de mover stock). Se agrega, al lado, el operario: la persona que
-- efectivamente ejecutó el movimiento, elegida en el modal.
--
-- Se guardan LAS DOS COSAS, id y nombre, a propósito:
--   operator_id    para filtrar y agrupar por persona sin depender del texto
--                  (y para que renombrar un operario no rompa los informes).
--   operator_name  foto del nombre al momento del movimiento. Lo que se muestra
--                  en el histórico sale de acá y NO de un JOIN: las cuatro
--                  vistas que listan movimientos ya leen stock_movements sola, y
--                  un histórico que se reescribe solo cuando alguien corrige un
--                  nombre no es un histórico.
--
-- AMBAS NULLABLES: todos los movimientos que ya existen no tienen operario, y
-- los caminos que no lo piden (ajuste de admin, descuento por pedido) siguen
-- funcionando sin él. La obligatoriedad vive en el modal de entrada/salida, que
-- es el que se usa desde la terminal compartida.
--
-- ON DELETE SET NULL y no CASCADE: si alguna vez se borra un operario, el
-- movimiento tiene que quedar igual. Igual la baja normal es active=false —
-- desactivar, nunca borrar — así el nombre sigue disponible para el histórico.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/40-operarios.sql
-- ============================================

CREATE TABLE IF NOT EXISTS operators (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    -- Se da de baja desactivando: deja de aparecer en el modal pero el histórico
    -- que lo nombra sigue intacto.
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dos "Juan" en la lista del modal son indistinguibles para el que tiene que
-- tocar el botón. El índice es sobre lower(name) porque "juan" y "Juan" son la
-- misma persona, y no lleva WHERE active: un nombre reciclado para otra persona
-- ensuciaría el histórico del anterior.
CREATE UNIQUE INDEX IF NOT EXISTS operators_name_unique ON operators (lower(name));

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS operator_name VARCHAR(100);

-- Para "todo lo que movió Juan este mes": el filtro por persona siempre viene
-- acompañado del orden por fecha que ya usan el histórico y el Excel.
CREATE INDEX IF NOT EXISTS stock_movements_operator_idx
    ON stock_movements (operator_id, created_at DESC);
