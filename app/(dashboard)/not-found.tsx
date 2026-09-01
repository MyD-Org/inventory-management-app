import { NotFoundScreen } from "@/components/not-found-screen"

// Lo que se ve cuando una pantalla del inventario no encuentra lo que fue a buscar:
// un material, una ficha, un presupuesto, una automatización, un dashboard. Los
// cinco llaman a notFound() y hasta ahora caían en el 404 pelado de Next.
//
// A DIFERENCIA DEL 404 GLOBAL, este se dibuja DENTRO del layout de (dashboard), así
// que el sidebar sigue ahí: quien llegó acá estaba trabajando en una sección y
// puede seguir sin volver a empezar.
//
// El texto es genérico porque el archivo es uno solo para las cinco pantallas.
// Nombrar cada cosa —"esa ficha no está"— pide un not-found.tsx por segmento.
export default function DashboardNotFound() {
    return (
        <NotFoundScreen
            title="No encontramos eso"
            description="Puede que se haya borrado o que la URL sea incorrecta."
            actionLabel="Ir al inicio"
            actionHref="/"
        />
    )
}
