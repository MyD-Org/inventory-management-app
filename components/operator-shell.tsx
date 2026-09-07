"use client"

import type { ReactNode } from "react"
import { signOut } from "next-auth/react"
import { useTheme } from "next-themes"
import { ClipboardList, ExternalLink, LogOut, Moon, Package, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
    const { theme, setTheme } = useTheme()
    const esOscuro = theme === "dark"

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
                <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-semibold leading-tight">Sistema de Inventario</p>
                </div>

                <div className="flex-1" />

                {/* Mismo criterio que la barra del admin: pedidos es otro módulo
                    con su propio layout y se abre en una pestaña aparte. */}
                <a href="/pedidos" target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                        <ClipboardList className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Pedidos</span>
                        <ExternalLink className="ml-1.5 h-3 w-3 text-muted-foreground" />
                    </Button>
                </a>

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
                                <p className="truncate text-xs text-muted-foreground">Operador</p>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => setTheme(esOscuro ? "light" : "dark")}
                                onSelect={(e) => e.preventDefault()}
                            >
                                {esOscuro ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                                {esOscuro ? "Modo claro" : "Modo oscuro"}
                            </DropdownMenuItem>
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
