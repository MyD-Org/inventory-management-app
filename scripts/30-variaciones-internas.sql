-- ============================================
-- Variaciones internas: las que NO elige el cliente.
--
-- CONTEXTO: hasta ahora un campo de variación tenía una sola perilla, `active`, y
-- servía para dos preguntas distintas: ¿existe este campo? y ¿el asistente del CRM
-- se lo ofrece al cliente? Mientras todas las variaciones las elegía el cliente
-- daba lo mismo. Ya no: hay variaciones que define el taller —cómo se arma, con
-- qué material— y que el cliente no tiene por qué ver ni decidir.
--
-- DOS PERILLAS, ENTONCES:
--   active              -> el campo existe. Apagado, no lo ve nadie.
--   offered_to_customer -> el asistente del CRM lo ofrece al tomar el pedido.
--                          Apagado, el campo sigue vivo para las familias, las
--                          fichas y la carga manual del pedido; lo que desaparece
--                          es la pregunta al cliente.
--
-- DÓNDE PEGA: SOLO en GET /api/specs, que es lo que consulta el bot. getSpecs() la
-- usan también la validación, el editor de ítems y las familias, y esas tienen que
-- seguir viendo todos los campos: un campo interno igual se completa, lo completa
-- el taller. Por eso el filtro está en el endpoint y no en la consulta.
--
-- TRUE por defecto: hasta hoy todo se le ofrecía al cliente, así que ese es el
-- comportamiento que no cambia nada al aplicar esta migración.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/30-variaciones-internas.sql
-- ============================================

ALTER TABLE spec_fields ADD COLUMN IF NOT EXISTS offered_to_customer BOOLEAN NOT NULL DEFAULT TRUE;

-- 'other' —"Otras indicaciones"— es el texto libre del pedido: donde va lo que no
-- entra en ninguna lista. Es FIJO: no se administra desde la pantalla de
-- variaciones, no se puede borrar ni ocultar, y no se lista ahí. Existe para el
-- CRM y para la carga del pedido, y punto.
--
-- Se re-crea si falta y se reactiva si alguien lo había apagado: la app asume que
-- está, y un pedido raro entra igual —si no hay dónde escribirlo, se escribe en
-- cualquier lado o se pierde—.
INSERT INTO spec_fields (key, label, free_text, kind, position, active, offered_to_customer)
VALUES ('other', 'Otras indicaciones', TRUE, 'text', 99, TRUE, TRUE)
ON CONFLICT (key) DO UPDATE SET active = TRUE, offered_to_customer = TRUE;
