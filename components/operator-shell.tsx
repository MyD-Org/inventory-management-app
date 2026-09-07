"use client"

import type { ReactNode } from "react"
import { signOut } from "next-auth/react"
import { ClipboardList, ExternalLink, LogOut, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

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

                <ThemeToggle />

                {user && (
                    <div className="flex items-center gap-2 border-l pl-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {initials}
                        </div>
                        <div className="hidden min-w-0 sm:block">
                            <p className="truncate text-sm font-medium leading-tight">{user.name}</p>
                            <p className="truncate text-xs text-muted-foreground">Operador</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => signOut()}
                            title="Cerrar sesión"
                        >
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </header>

            {children}
        </div>
    )
}
