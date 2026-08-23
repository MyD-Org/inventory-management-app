"use client"

// Tablero y lista son la misma información: un interruptor, no dos secciones.

import Link from "next/link"
import { KanbanSquare, List } from "lucide-react"

export function ViewToggle({ lista }: { lista: boolean }) {
    const base = "flex items-center gap-2 px-3 py-1.5 text-base rounded-md transition-colors"
    const on = "bg-background shadow-sm font-medium"
    const off = "text-muted-foreground hover:text-foreground"

    return (
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
            <Link href="/pedidos" className={`${base} ${lista ? off : on}`}>
                <KanbanSquare className="h-4 w-4" />
                Tablero
            </Link>
            <Link href="/pedidos?vista=lista" className={`${base} ${lista ? on : off}`}>
                <List className="h-4 w-4" />
                Lista
            </Link>
        </div>
    )
}
