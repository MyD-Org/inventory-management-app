-- ============================================
-- Otros costos: poder elegir una materia prima del inventario
--
-- CONTEXTO: la sección "Otros Costos" de la ficha era texto libre + importe
-- ("flete", "pintura", $12000). Cuando lo que se quiere sumar es un material que
-- SÍ está en el inventario (una lata de pintura, un consumible), el importe había
-- que copiarlo a mano y quedaba viejo apenas cambiaba el precio del material.
--
-- QUÉ TOCA: budget_extras gana la vinculación opcional con un material, igual que
-- budget_materials: material_id + qty + unit_cost (snapshot al guardar).
--   * material_id NULL  = línea de texto libre, como siempre. qty/unit_cost NULL.
--   * material_id NOT NULL = línea vinculada; amount = qty * unit_cost y se
--     refresca con "Actualizar precios" del editor.
--
-- IMPORTANTE: amount SIGUE siendo el total de la línea en los dos casos, así que
-- todo lo que ya suma extras (la lista de fichas, las tools de IA, costed-products)
-- no cambia. Esto es SOLO costo: una línea de Otros Costos NO entra al BOM del
-- pedido y NO se descuenta del depósito.
-- ============================================

ALTER TABLE budget_extras
    ADD COLUMN IF NOT EXISTS material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS qty DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10,2);
