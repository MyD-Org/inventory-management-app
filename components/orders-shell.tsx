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
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { ArrowLeftRight, LogOut, Monitor, MoonStar, MoreVertical, Plus, Settings, Sun } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
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
    // El submenú se monta recién al abrirlo, ya en el cliente: para entonces
    // next-themes tiene el tema resuelto y no hay desajuste con el server.
    const { theme, setTheme } = useTheme()
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
                <div className="w-full px-8 flex items-center justify-between h-14 gap-4">
                    <Link href="/pedidos" className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold shrink-0">Pedidos</span>
                    </Link>

                    <div className="flex items-center gap-1 shrink-0">
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
                                <DropdownMenuItem asChild>
                                    <Link href="/">
                                        <ArrowLeftRight className="mr-2 h-4 w-4" />
                                        Ir al inventario
                                    </Link>
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                {/* Las tres opciones van derecho en el menú, sin submenú:
                                    en una ventana angosta el submenú no tiene lugar para
                                    abrirse al costado y queda inservible. */}
                                <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                                    Apariencia
                                </DropdownMenuLabel>
                                <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                                    <DropdownMenuRadioItem value="light">
                                        <Sun className="h-4 w-4" />
                                        Claro
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="dark">
                                        <MoonStar className="h-4 w-4" />
                                        Oscuro
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="system">
                                        <Monitor className="h-4 w-4" />
                                        El del sistema
                                    </DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
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
