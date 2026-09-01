import { NotFoundScreen } from "@/components/not-found-screen"

// RED DE CONTENCIÓN del inventario. Las cinco pantallas que llaman a notFound()
// —material, ficha, presupuesto, automatización, dashboard— tienen cada una su
// propio not-found.tsx y nombran lo que falta. Este cubre lo que quede afuera: una
// pantalla nueva que llame a notFound() sin haber puesto el suyo.
//
// A DIFERENCIA DEL 404 GLOBAL, se dibuja DENTRO del layout de (dashboard), así que
// el sidebar sigue ahí: quien llegó acá estaba trabajando en una sección y puede
// seguir sin volver a empezar.
export default function DashboardNotFound() {
    return (
        <NotFoundScreen
            title="Página no encontrada"
            description="Puede que se haya borrado o que la URL sea incorrecta."
            actionLabel="Ir al inicio"
            actionHref="/"
        />
    )
}
