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
import { ArrowLeftRight, LogOut, MoreVertical, Plus, Settings } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function OrdersShell({
    user,
    children,
}: {
    user: { name?: string | null; email?: string | null; role?: string }
    children: ReactNode
}) {
    const router = useRouter()
    const isAdmin = user?.role === "admin"
    // "c" abre el alta desde cualquier pantalla del módulo, como en Linear.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const t = e.target as HTMLElement
            if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
            if (e.metaKey || e.ctrlKey || e.altKey) return
            if (e.key === "c") {
                e.preventDefault()
                router.push("/pedidos/nuevo")
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [router])

    return (
        <div className="h-dvh bg-background flex flex-col overflow-hidden">
            <header className="border-b bg-background shrink-0">
                <div className="w-full px-8 flex items-center justify-between h-14 gap-4">
                    <Link href="/pedidos" className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold shrink-0">Pedidos</span>
                        <span className="text-muted-foreground hidden sm:inline">·</span>
                        <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                            Taller Avantec
                        </span>
                    </Link>

                    <div className="flex items-center gap-1 shrink-0">
                        <Link href="/pedidos/nuevo">
                            <Button size="sm">
                                <Plus className="h-4 w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Nuevo pedido</span>
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
                                <DropdownMenuItem asChild>
                                    <Link href="/">
                                        <ArrowLeftRight className="mr-2 h-4 w-4" />
                                        Ir al inventario
                                    </Link>
                                </DropdownMenuItem>
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
