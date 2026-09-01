import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ChevronRight } from "lucide-react"
import { CustomerStatusMap } from "@/components/customer-status-map"
import { getCustomerStatusMap } from "@/lib/orders"

export const dynamic = 'force-dynamic';

// Lo que es DE LOS PEDIDOS y de nada más: cómo se le nombra cada estado al cliente.
//
// Las variaciones de producto vivían acá y se mudaron a /settings/variaciones: no
// son de los pedidos, las usan también las familias y las fichas. Los pedidos las
// consumen, igual que el resto del inventario.
export default async function OpcionesPedidoPage() {
    const session = await auth()
    if (session?.user?.role !== 'admin') redirect('/pedidos')

    const statusMap = await getCustomerStatusMap()

    return (
        <div className="mx-auto w-full max-w-3xl px-8 py-6">
            <div className="flex items-center gap-1.5 text-base text-muted-foreground mb-4">
                <Link href="/pedidos" className="hover:text-foreground">
                    Pedidos
                </Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-foreground">Opciones</span>
            </div>
            <h1 className="text-2xl font-bold mb-1">Opciones de pedido</h1>
            <p className="text-base text-muted-foreground mb-6">
                Cómo se le cuenta al cliente en qué anda su pedido. El bot responde con estos
                textos, no con la jerga interna del taller.
            </p>

            <CustomerStatusMap current={statusMap} />

            {/* Quien venía acá a cargar una óptica nueva tiene que encontrar dónde
                fue a parar, sin salir a buscarla por el menú. */}
            <p className="mt-8 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Las variaciones de producto —color de LED, óptica, grampa— se editan en{" "}
                <Link href="/settings/variaciones" className="underline">
                    Configuración → Variaciones de producto
                </Link>
                . Se mudaron porque también las usan las familias de materiales y las fichas.
            </p>
        </div>
    )
}
