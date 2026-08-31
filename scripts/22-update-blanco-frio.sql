-- Actualizar "Blanco Frio" a "Blanco Frio 5700" y agregar "Blanco Frio 6000".
UPDATE spec_options
SET value = 'Blanco Frio 5700',
    label = 'Blanco Frio 5700'
WHERE field_key = 'led_color'
  AND value = 'Blanco Frio';

-- Agregar el nuevo valor 6000. Si ya existe, no hace nada.
INSERT INTO spec_options (field_key, value, label, position)
SELECT 'led_color', 'Blanco Frio 6000', 'Blanco Frio 6000', COALESCE((SELECT MAX(position) + 1 FROM spec_options WHERE field_key = 'led_color'), 1)
WHERE NOT EXISTS (
    SELECT 1 FROM spec_options WHERE field_key = 'led_color' AND value = 'Blanco Frio 6000'
);
