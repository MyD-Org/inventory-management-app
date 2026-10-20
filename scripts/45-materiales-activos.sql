-- Materiales desactivados: siguen en el inventario pero no se descuentan.
--
-- POR QUÉ: hay materiales que dejaron de usarse (un modelo discontinuado, una
-- variante que ya no se compra) y seguían apareciendo al preparar un pedido: en
-- el buscador de "agregar material", entre las opciones de una familia y en la
-- receta. El taller los elegía por error.
--
-- Desactivar no borra nada: el material, su stock y su historial quedan. Se
-- vuelve a activar desde el inventario con el mismo botón.
--
-- Se puede correr dos veces.
--
-- Aplicar en prod:  node scripts/run-sql.js scripts/45-materiales-activos.sql

ALTER TABLE materials ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
