-- Código de referencia de los productos de Alegra.
--
-- Alegra lo tiene desde siempre (campo "reference" del ítem, la "Referencia" de
-- la pantalla de producto) pero el espejo no lo traía. Hoy está cargado en 16 de
-- 1709 ítems: la idea es cargarlo en todos y poder buscar por él, tanto en el
-- formulario del pedido como desde el bot.
--
-- Mientras tanto la columna queda mayormente en NULL y eso es correcto: un
-- producto sin código simplemente no se encuentra por código.
--
-- NO es UNIQUE a propósito. Alegra no lo obliga y hoy hay códigos repetidos o
-- basura ("LED", "12345", "."); una restricción acá haría fallar el sync entero
-- por un dato mal cargado del otro lado, que es exactamente cuando más falta
-- hace que el espejo esté al día.
ALTER TABLE alegra_items ADD COLUMN IF NOT EXISTS reference VARCHAR(120);

-- Normalizado (minúsculas, sin tildes ni espacios de más) para poder comparar el
-- código exacto sin depender de cómo lo tipeó quien busca.
ALTER TABLE alegra_items ADD COLUMN IF NOT EXISTS reference_normalized VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_alegra_items_reference ON alegra_items(reference_normalized);
