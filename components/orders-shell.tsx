"use client"

// Shell del módulo de pedidos: barra única, pensada para el taller.
// Deliberadamente NO muestra inventario, costos ni dashboards. El link
// "Inventario" cruza al otro módulo para quien tenga que ver las dos cosas.
//
// Sin barra de pestañas: la única sección real es Pedidos (el interruptor
// Tablero/Lista vive dentro de la página) y la configuración del vocabulario se
// toca cada varios meses, así que va detrás de un engranaje, no en el camino.

import { useEffect, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { ArrowLeftRight, LogOut, MoreVertical, Package, Plus, Settings, SlidersHorizontal } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeMenuItems } from "@/components/theme-menu-items"
import { isOrdersOnly } from "@/lib/roles"

export function OrdersShell({
    user,
    children,
}: {
    user: { name?: string | null; email?: string | null; role?: string }
    children: ReactNode
}) {
    const router = useRouter()
    const isAdmin = user?.role === "admin"
    // "Solo pedidos": el inventario no le abre, así que los dos accesos que
    // cruzan al otro módulo sobran. Un link que lleva a un redirect es peor que
    // no tenerlo: parece que algo se rompió.
    const soloPedidos = isOrdersOnly(user?.role)
    // "n" abre el alta desde cualquier pantalla del módulo, como en Linear.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const t = e.target as HTMLElement
            if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
            if (e.metaKey || e.ctrlKey || e.altKey) return
            if (e.key === "n") {
                e.preventDefault()
                router.push("/pedidos/nuevo")
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [router])

    return (
        <div className="h-dvh bg-background flex flex-col overflow-hidden">
            <header className="border-b bg-background shrink-0 no-print">
                <div className="w-full px-4 sm:px-8 flex items-center justify-between h-14 gap-4">
                    <Link href="/pedidos" className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold shrink-0">Pedidos</span>
                    </Link>

                    <div className="flex items-center gap-1 shrink-0">
                        {/* Para el operador, pedidos es la pantalla donde cae
                            después del login: si la vuelta al inventario queda
                            escondida en el menú de los tres puntos, no la
                            encuentra. Fijo y con la palabra entera, igual que
                            el botón de Pedidos del otro lado. El admin llega
                            desde el sidebar y no lo necesita en la barra. */}
                        {!isAdmin && !soloPedidos && (
                            <Link href="/">
                                <Button variant="outline" size="sm" className="mr-1">
                                    <Package className="mr-2 h-4 w-4" />
                                    <span>Inventario</span>
                                </Button>
                            </Link>
                        )}

                        <Link href="/pedidos/nuevo">
                            {/* El atajo se anuncia en el botón: si no, nadie lo descubre.
                                En pantalla angosta el botón es solo el ícono y la tecla
                                no entra, así que ahí queda en el title. */}
                            <Button size="sm" title="Nuevo pedido (n)">
                                <Plus className="h-4 w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Nuevo pedido</span>
                                <kbd className="hidden sm:inline-flex ml-2 h-5 min-w-5 items-center justify-center rounded border border-primary-foreground/30 px-1 font-mono text-[0.7rem] text-primary-foreground/70">
                                    n
                                </kbd>
                            </Button>
                        </Link>

                        {/* Lo de todos los días es crear un pedido; el resto son
                            cosas puntuales y no merecen un icono cada una. */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" title="Más opciones">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                {isAdmin && (
                                    <DropdownMenuItem asChild>
                                        <Link href="/pedidos/opciones">
                                            <Settings className="mr-2 h-4 w-4" />
                                            Opciones de pedido
                                        </Link>
                                    </DropdownMenuItem>
                                )}
                                {/* El vocabulario se editaba desde acá y ahora vive en
                                    configuración del inventario. El atajo se queda: es
                                    donde la costumbre lo busca. */}
                                {isAdmin && (
                                    <DropdownMenuItem asChild>
                                        <Link href="/settings/variaciones">
                                            <SlidersHorizontal className="mr-2 h-4 w-4" />
                                            Variaciones de producto
                                        </Link>
                                    </DropdownMenuItem>
                                )}
                                {/* El operador ya tiene el botón "Inventario"
                                    fijo en la barra: repetirlo acá es ruido.
                                    Para el admin, que no lo tiene, este es el
                                    único cruce al otro módulo. */}
                                {isAdmin && (
                                    <DropdownMenuItem asChild>
                                        <Link href="/">
                                            <ArrowLeftRight className="mr-2 h-4 w-4" />
                                            Ir al inventario
                                        </Link>
                                    </DropdownMenuItem>
                                )}

                                <DropdownMenuSeparator />

                                <ThemeMenuItems />

                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Cerrar sesión
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </header>

            <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
        </div>
    )
}
