-- Grampas: devolverle a cada opción su clave y dejar el nombre nuevo como nombre.
--
-- POR QUÉ: renombrar una opción desde /settings/variaciones pisaba también su
-- `value`, que es la clave con la que la opción está enganchada en las familias,
-- las variantes de las fichas y las specs de los pedidos. Las seis grampas se
-- renombraron así y quedaron desenganchadas: un pedido nuevo con "Corta" no
-- encontraba material en ninguna ficha y la grampa no se descontaba.
--
-- Desde fix/renombrar-opcion-sin-romper-vinculos renombrar cambia solo `label`.
-- Esto repara lo que ya se había roto: `value` vuelve a la clave que tienen las
-- familias y las fichas, y `label` conserva el nombre que eligió el taller.
--
-- "Grampa corte negra" (con e) es la clave tal cual está en las familias y las
-- fichas; es interna y no se ve en ninguna pantalla.
--
-- Solo toca filas que siguen con el value renombrado: se puede correr dos veces.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/44-grampas-clave-y-nombre.sql

UPDATE spec_options SET value = 'Grampa corta',       label = 'Corta'       WHERE id = 49 AND field_key = 'clamp' AND value = 'Corta';
UPDATE spec_options SET value = 'Grampa corte negra', label = 'Corta negra' WHERE id = 50 AND field_key = 'clamp' AND value = 'Corta negra';
UPDATE spec_options SET value = 'Grampa larga',       label = 'larga'       WHERE id = 51 AND field_key = 'clamp' AND value = 'larga';
UPDATE spec_options SET value = 'Grampa larga negra', label = 'larga negra' WHERE id = 52 AND field_key = 'clamp' AND value = 'larga negra';
UPDATE spec_options SET value = 'Grampa en U negra',  label = 'U negra'     WHERE id = 54 AND field_key = 'clamp' AND value = 'U negra';
UPDATE spec_options SET value = 'Grampa en U',        label = 'U'           WHERE id = 55 AND field_key = 'clamp' AND value = 'U';
