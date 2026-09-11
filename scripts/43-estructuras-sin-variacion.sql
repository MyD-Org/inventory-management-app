-- ============================================
-- Las familias de estructuras dejan de variar por Color del equipo:
-- las elige la fábrica al fabricar.
--
-- POR QUÉ: "aluminio" y "negro" nunca fueron de verdad dos variantes del mismo
-- pedido. La estructura que sale del depósito depende de lo que haya y de cómo
-- se arme el equipo —corto o largo, con cable o sin cable, para acrílico— y eso
-- lo decide el taller en el momento, no una respuesta del cliente. Mientras
-- estuvieron colgadas de body_color, el BOM elegía sola una estructura por el
-- color declarado y el operario no podía cambiarla.
--
-- QUÉ QUEDA: una familia MANUAL (scripts/41-familia-manual.sql). Los MISMOS
-- materiales que ya estaban cargados —no se suma ni se saca ninguno—, ahora
-- todos juntos como opciones sin color, y el operario elige cuál consume desde
-- el diálogo de descuento. El costo de la familia NO se mueve: las cinco costean
-- por 'average', que siempre promedió TODOS los materiales sin mirar el color
-- (ver familyUnitCost en lib/material-family.ts).
--
-- EL ORDEN DE LOS PASOS IMPORTA. material_family_options tiene un índice único
-- parcial sobre (family_id, spec_value) WHERE is_default: si se colapsara el
-- color al sentinela '' antes de dejar un solo predeterminado por familia, las
-- familias con default en aluminio Y en negro chocarían contra el índice.
--
-- Aplicar:  node scripts/run-sql.js scripts/43-estructuras-sin-variacion.sql
--           (respeta NEON_LOCAL_PROXY; sin proxy va al Neon remoto)
-- ============================================

-- 1. Un solo material de referencia por familia: el que ya costeaba, o sea el
--    predeterminado de la variante predeterminada (aluminio en las cinco). El
--    resto pierde la marca. Los que pasan de TRUE a FALSE no pueden violar el
--    índice único, así que este paso es seguro tal cual está.
UPDATE material_family_options o
SET is_default = (o.spec_value = f.default_spec_value AND o.is_default)
FROM material_families f
WHERE f.id = o.family_id
  AND f.spec_field_key = 'body_color'
  AND f.name IN (
    'Estructura Optic 4',
    'Estructura bidireccional 32mm 2 led',
    'Estructura optic 1 interior',
    'Estructura optic 3 exterior',
    'Estructuras optic 1 exterior'
  );

-- 2. Todas las opciones pasan al sentinela de familia manual: spec_value ''.
--    Una opción real de variación nunca es vacía, así que no puede chocar con
--    un valor cargado a mano.
UPDATE material_family_options o
SET spec_value = ''
FROM material_families f
WHERE f.id = o.family_id
  AND f.spec_field_key = 'body_color'
  AND f.name IN (
    'Estructura Optic 4',
    'Estructura bidireccional 32mm 2 led',
    'Estructura optic 1 interior',
    'Estructura optic 3 exterior',
    'Estructuras optic 1 exterior'
  );

-- 3. La familia deja de variar. default_spec_value = '' es lo que escribe la
--    app al guardar una familia manual desde la pantalla de familias
--    (insertMaterialFamily cae al spec_value de la primera opción, que es '').
UPDATE material_families
SET spec_field_key = NULL,
    default_spec_value = '',
    updated_at = NOW()
WHERE spec_field_key = 'body_color'
  AND name IN (
    'Estructura Optic 4',
    'Estructura bidireccional 32mm 2 led',
    'Estructura optic 1 interior',
    'Estructura optic 3 exterior',
    'Estructuras optic 1 exterior'
  );

-- 4. Las líneas de ficha vinculadas tienen que quedar como las dejaría la app.
--    Una línea de familia manual es spec_field_key NULL y CERO opciones propias
--    (familyLineOptions devuelve [] para una familia sin variación, y
--    validBudgetPayload rechaza opciones sin campo de variación).
--
--    NO ES COSMÉTICO: al explotar el BOM, lib/orders.ts lee
--    COALESCE(f.spec_field_key, bm.spec_field_key). Si la línea se quedara con
--    'body_color', seguiría buscando una opción de color contra una familia que
--    ya solo tiene '', no encontraría ninguna y la estructura saldría del BOM
--    como no mapeada.
--
--    Las opciones que se borran no llevan cantidad por variante (qty NULL en las
--    diez), así que no se pierde ninguna cantidad cargada a mano.
DELETE FROM budget_material_options
WHERE budget_material_id IN (
    SELECT bm.id
    FROM budget_materials bm
    JOIN material_families f ON f.id = bm.family_id
    WHERE f.spec_field_key IS NULL
      AND f.name IN (
        'Estructura Optic 4',
        'Estructura bidireccional 32mm 2 led',
        'Estructura optic 1 interior',
        'Estructura optic 3 exterior',
        'Estructuras optic 1 exterior'
      )
);

UPDATE budget_materials bm
SET spec_field_key = NULL
FROM material_families f
WHERE f.id = bm.family_id
  AND f.spec_field_key IS NULL
  AND f.name IN (
    'Estructura Optic 4',
    'Estructura bidireccional 32mm 2 led',
    'Estructura optic 1 interior',
    'Estructura optic 3 exterior',
    'Estructuras optic 1 exterior'
  );

-- 5. Los pedidos YA EXPLOTADOS guardaron la estructura con spec_value
--    'aluminio'. Las alternativas que se le ofrecen al operario al descontar se
--    buscan por (family_id, spec_value) contra la familia viva: con 'aluminio'
--    no encontraría ninguna y perdería la posibilidad de elegir otra estructura,
--    que es justo lo que este cambio viene a habilitar.
UPDATE order_item_materials oim
SET spec_value = ''
FROM material_families f
WHERE f.id = oim.family_id
  AND f.spec_field_key IS NULL
  AND f.name IN (
    'Estructura Optic 4',
    'Estructura bidireccional 32mm 2 led',
    'Estructura optic 1 interior',
    'Estructura optic 3 exterior',
    'Estructuras optic 1 exterior'
  );
