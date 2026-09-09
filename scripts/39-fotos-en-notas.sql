-- Fotos en las notas del pedido.
--
-- Los archivos NO van en la base: viven en el Blob store de Vercel y acá queda
-- la URL. Una foto de celular pesa 3-5 MB; guardarlas en Neon infla la base y
-- hace lenta cualquier consulta que toque order_events.
--
-- Tabla aparte y no una columna jsonb en order_events, por dos motivos: una
-- nota puede tener varias fotos, y al borrarla hay que recorrer los archivos
-- uno por uno para sacarlos del Blob (el CASCADE limpia la base, no el store).
--
-- pathname es lo que necesita del() para borrar del Blob. Se guarda además de
-- la URL porque es la clave real del archivo allá.
CREATE TABLE IF NOT EXISTS order_event_photos (
    id          SERIAL PRIMARY KEY,
    event_id    INTEGER NOT NULL REFERENCES order_events(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    pathname    TEXT NOT NULL,
    -- Para reservar el espacio del thumbnail antes de que cargue la imagen y
    -- que la lista no salte. Nullable: si el navegador no las dio, se ignora.
    width       INTEGER,
    height      INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Siempre se leen por evento, al pintar el hilo de actividad.
CREATE INDEX IF NOT EXISTS order_event_photos_event_idx ON order_event_photos (event_id);
