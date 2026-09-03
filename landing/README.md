# Landing de Tevro

Página estática, sin dependencias ni build.

- `tevro-landing.html` — **fuente**: título, estilos y contenido, sin `<head>`/`<body>`.
  Es lo que se publica como Artifact para previsualizar.
- `index.html` — la misma página envuelta en un documento HTML completo, lista para
  deployar en cualquier hosting estático (Vercel, Netlify, Cloudflare Pages, S3).

Si editás `tevro-landing.html`, regenerá `index.html` copiando el `<title>`, los `<link>`
de fuentes y el `<style>` al `<head>`, y el resto dentro del `<body>`.

## Antes de publicarla

Buscar y reemplazar los marcadores:

- `wa.me/NUMERO` → número de WhatsApp real en formato internacional sin `+`
  (ej. `5493511234567`).
- `hola@tevro.com` → mail de contacto real.
- Revisar el bloque "Programa fundador": dice **5 empresas**; ajustar si cambia.

La página no incluye precios a propósito: en esta etapa el objetivo es la demo, y el
precio se define por rubro y tamaño de catálogo.
