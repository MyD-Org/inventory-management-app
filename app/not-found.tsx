import { NotFoundScreen } from "@/components/not-found-screen"

// El 404 de TODA la app: direcciones que no matchean ninguna ruta.
//
// Se dibuja con el layout raíz, sin sidebar ni barra del taller, porque una URL
// inventada no pertenece a ninguna sección: no hay contexto que conservar. Por eso
// la salida es el inicio y no "volver", que no se sabe a dónde sería.
export default function NotFound() {
    return (
        <NotFoundScreen
            title="Página no encontrada"
            description="Puede que se haya movido o que la URL sea incorrecta."
            actionLabel="Ir al inicio"
            actionHref="/"
        />
    )
}
