-- Una ficha por producto: el nombre es único, sin distinguir mayúsculas.
--
-- Por qué hace falta un índice y no alcanza con validar en la app: el nombre de
-- la ficha es la CLAVE con la que el resto del sistema encuentra el producto.
-- resolveProduct() (lib/orders.ts) busca la hoja de costo por nombre y, con dos
-- fichas iguales, se queda con la más nueva (ORDER BY id DESC) sin avisar: el
-- pedido explota el BOM de una ficha que nadie eligió. Lo mismo hacen las tools
-- de IA search_costed_products y get_product_recipe, que también resuelven por
-- nombre.
--
-- Índice sobre lower(name) y no UNIQUE en la columna: "Optic 1" y "optic 1" son
-- el mismo producto para todo el que lo busca, empezando por resolveProduct(),
-- que compara con lower().

-- Si hay duplicados de antes, esto falla y hay que unificarlos a mano. Es a
-- propósito: cuál de las dos fichas es la buena lo sabe el taller, no un script.
-- Para verlos:
--   SELECT lower(name), COUNT(*), array_agg(id ORDER BY id)
--   FROM budgets GROUP BY 1 HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS budgets_name_unique ON budgets (lower(name));
