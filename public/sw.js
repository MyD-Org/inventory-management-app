// Service worker MÍNIMO y a propósito: Chrome en Android no ofrece "Instalar"
// sin uno registrado que atienda fetch, y esto es lo único que hace falta para
// eso. NO cachea nada.
//
// No cachear es la decisión: todas las pantallas son server-rendered y salen de
// la sesión de quien está logueado (ver force-dynamic en las páginas). Un caché
// acá le mostraría al operario datos de stock viejos —o peor, la pantalla de
// otra persona en un teléfono compartido— sin forma de saber que son viejos.
// Que la app ande sin señal es otro trabajo: cola local de movimientos +
// sincronización, no un caché de páginas.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
self.addEventListener("fetch", () => {
  // Sin respondWith: cada pedido sigue derecho a la red, como sin service worker.
})
