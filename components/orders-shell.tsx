"use client"

// Shell del módulo de pedidos: navegación corta, pensada para el taller.
// Deliberadamente NO muestra inventario, costos ni dashboards. El link "Sistema
// de inventario" cruza al otro módulo para quien tenga que ver las dos cosas.

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { KanbanSquare, ListChecks, Plus, ArrowLeftRight, LogOut } from "lucide-react"

const NAV = [
    { label: "Pedidos", href: "/pedidos", icon: KanbanSquare, exact: true },
    { label: "Nuevo", href: "/pedidos/nuevo", icon: Plus },
    { label: "Opciones", href: "/pedidos/opciones", icon: ListChecks, adminOnly: true },
]

export function OrdersShell({
    user,
    children,
}: {
    user: { name?: string | null; email?: string | null; role?: string }
    children: ReactNode
}) {
    const pathname = usePathname()
    const isAdmin = user?.role === "admin"

    return (
        <div className="h-dvh bg-background flex flex-col overflow-hidden">
            <header className="border-b bg-background z-10 shrink-0">
                <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between h-14 gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold shrink-0">Pedidos</span>
                            <span className="text-muted-foreground hidden sm:inline">·</span>
                            <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                                Taller Avantec
                            </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <Link href="/" title="Ir al sistema de inventario">
                                <Button variant="ghost" size="sm">
                                    <ArrowLeftRight className="h-4 w-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Inventario</span>
                                </Button>
                            </Link>
                            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <nav className="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
                        {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
                            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors ${
                                        active
                                            ? "border-primary text-foreground font-medium"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                </Link>
                            )
                        })}
                    </nav>
                </div>
            </header>

            <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
        </div>
    )
}
