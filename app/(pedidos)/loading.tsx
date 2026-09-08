// Lo que se ve mientras el server arma la pantalla de pedidos. Todo el módulo
// es force-dynamic y consulta la base en cada carga: sin esto, entre que se
// aprieta el botón y llega el HTML no hay NADA que pintar, y en el teléfono
// —donde el viaje a la base se nota más— eso se veía como un parpadeo blanco.
//
// Cubre a todo el route group (tablero, detalle y alta) porque vive al lado de
// su layout: el shell de pedidos ya está dibujado y esto reemplaza solo al
// contenido.
export default function Loading() {
    return (
        <div className="w-full px-4 py-6 sm:px-8">
            <div className="h-7 w-40 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted/60" />

            {/* Cuatro recuadros: son los del resumen del tablero, que es la
                pantalla desde la que se entra casi siempre. */}
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/50" />
                ))}
            </div>

            <div className="mt-6 space-y-3">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="h-28 animate-pulse rounded-lg bg-muted/40" />
                ))}
            </div>

            <span className="sr-only">Cargando pedidos…</span>
        </div>
    )
}
