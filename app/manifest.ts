import type { MetadataRoute } from "next"

// PWA: esto es lo que hace que el teléfono ofrezca "Instalar" y que, una vez
// instalada, la app abra SIN la barra de direcciones (display: standalone).
// Se sirve en /manifest.webmanifest — ojo que esa ruta tiene que quedar fuera
// del matcher del middleware (ver middleware.ts): el navegador la pide sin
// sesión y si la redirige al login, el "Instalar" no aparece nunca.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sistema de Inventario",
    // El que se ve DEBAJO del ícono en la pantalla de inicio: entran ~12
    // caracteres antes de que el teléfono lo corte con puntos suspensivos.
    short_name: "Inventario",
    description: "Gestión de stock de materias primas con código de barras",
    start_url: "/",
    display: "standalone",
    // El operario la usa con una mano y el teléfono en vertical; el escáner de
    // cámara también está pensado en ese eje.
    orientation: "portrait",
    background_color: "#171717",
    theme_color: "#171717",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Android recorta el ícono a la forma que tenga el launcher (círculo,
      // squircle): el maskable va a sangre, sin bordes redondeados propios,
      // para que no le corte una esquina al dibujo.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
