"use client"

import type { ReactNode } from "react"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ClipboardList, LayoutGrid, LogOut, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeMenuItems } from "@/components/theme-menu-items"
import { setSimpleView } from "@/lib/view-mode"

// Shell del OPERADOR: sin sidebar. Su trabajo son dos acciones (cargar y
// descontar stock) y los dos viven en un modal, así que un menú de navegación
// no tendría a dónde llevarlo. Queda solo la barra de arriba con lo que sí
// necesita: el acceso a Pedidos, el tema y cerrar sesión.
// El admin sigue con el sidebar completo (ver AppShell).
export function OperatorShell({
    user,
    children,
}: {
    user?: { name?: string | null; email?: string | null; role?: string }
    children: ReactNode
}) {
    const initials = user?.name?.slice(0, 2).toUpperCase() || "US"
    const router = useRouter()
    // Un admin acá adentro está en "vista simple" y necesita la puerta de
    // vuelta: sin sidebar, este menú es el único lugar donde puede estar.
    const isAdmin = user?.role === "admin"

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
                <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 shrink-0 text-muted-foreground" />
                    {/* "Inventario" a secas: "Sistema de Inventario" ocupaba
                        media barra en el teléfono y empujaba al botón de
                        Pedidos a quedarse sin su palabra. */}
                    <p className="font-display text-base font-semibold leading-tight">Inventario</p>
                </div>

                <div className="flex-1" />

                {/* En la MISMA pestaña, al revés que en la barra del admin: para
                    el operador pedidos ya no es "el otro módulo que se abre
                    aparte", es donde arranca después del login. Los dos son
                    pares y se cruza con un botón de cada lado (el de vuelta
                    vive en OrdersShell). Con target="_blank" cada cruce le
                    dejaba una pestaña más abierta. */}
                <Link href="/pedidos">
                    <Button variant="outline" size="sm">
                        <ClipboardList className="mr-2 h-4 w-4" />
                        <span>Pedidos</span>
                    </Button>
                </Link>

                {/* Nombre y cerrar sesión viven DENTRO del avatar: sueltos en la
                    barra, en pantalla angosta la hacían saltar a dos líneas. */}
                {user && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                title={user.name ?? "Cuenta"}
                                aria-label="Abrir menú de la cuenta"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {initials}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="font-normal">
                                <p className="truncate text-sm font-medium">{user.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {isAdmin ? "Admin · vista simple" : "Operador"}
                                </p>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {isAdmin && (
                                <>
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setSimpleView(false)
                                            router.refresh()
                                        }}
                                    >
                                        <LayoutGrid className="mr-2 h-4 w-4" />
                                        Vista completa
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                </>
                            )}
                            <ThemeMenuItems />
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => signOut()}>
                                <LogOut className="mr-2 h-4 w-4" />
                                Cerrar sesión
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

            </header>

            {children}
        </div>
    )
}
