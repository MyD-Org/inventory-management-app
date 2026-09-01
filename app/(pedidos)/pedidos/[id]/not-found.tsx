import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PackageX } from "lucide-react"

// Qué se ve al abrir un pedido que no está: borrado, o un número de más en la
// dirección.
//
// EXISTE PORQUE SIN ESTO NEXT MUESTRA SU 404 PELADO, que reemplaza la pantalla
// entera: sin el shell del taller, sin navegación y sin forma de volver que no
// sea el botón atrás del navegador. Un pedido que no está no es una falla de la
// app, y no tiene que parecerlo.
//
// Al vivir en este segmento se dibuja DENTRO del layout de (pedidos), así que la
// barra y el resto de la app siguen ahí.
export default function PedidoNoEncontrado() {
    return (
        <div className="mx-auto w-full max-w-md px-8 py-20 text-center">
            <PackageX className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 font-display text-2xl font-bold">Ese pedido no existe</h1>
            <p className="mt-2 text-base text-muted-foreground">
                Puede que se haya borrado, o que el número de la dirección no sea el correcto.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
                <Button asChild>
                    <Link href="/pedidos">Ver el tablero</Link>
                </Button>
                <Button variant="ghost" asChild>
                    <Link href="/pedidos?vista=lista">Ver la lista</Link>
                </Button>
            </div>
        </div>
    )
}
