-- Renombrar la opción "Blanco calido 2750" a "Blanco calido 2700".
-- El value también se actualiza para que lo nuevo use 2700.
UPDATE spec_options
SET value = 'Blanco calido 2700',
    label = 'Blanco calido 2700'
WHERE field_key = 'led_color'
  AND value IN ('Blanco calido 2750', 'Blanco cálido 2750');
