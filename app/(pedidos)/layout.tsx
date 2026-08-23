import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { OrdersShell } from "@/components/orders-shell"

// Route group propio del módulo de pedidos. El público es el taller, que no
// necesita ver inventario, costos ni dashboards: por eso tiene su propio shell
// con navegación corta en vez del sidebar completo de (dashboard).
// Las URLs no cambian por estar en un route group.
export default async function OrdersLayout({ children }: { children: ReactNode }) {
    const session = await auth()
    if (!session?.user) redirect('/login')

    return <OrdersShell user={session.user}>{children}</OrdersShell>
}
