import { NotFoundScreen } from "@/components/not-found-screen"

// Qué se ve al abrir un pedido que no está.
//
// EXISTE PORQUE SIN ESTO NEXT MUESTRA SU 404 PELADO, que reemplaza la pantalla
// entera: sin el shell del taller, sin navegación y sin forma de volver que no
// sea el botón atrás del navegador. Un pedido que no está no es una falla de la
// app, y no tiene que parecerlo.
//
// Al vivir en este segmento se dibuja DENTRO del layout de (pedidos), así que la
// barra y el resto de la app siguen ahí. Lo único propio es a dónde se vuelve:
// al tablero, que es de donde vino.
export default function PedidoNoEncontrado() {
    return (
        <NotFoundScreen
            title="Pedido no encontrado"
            description="Puede que se haya borrado o que la URL sea incorrecta."
            actionLabel="Volver al tablero"
            actionHref="/pedidos"
        />
    )
}
