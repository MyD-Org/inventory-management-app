"use client"

// Tablero, lista y producción son la misma información: un interruptor, no tres
// secciones. Producción tiene ruta propia (/pedidos/produccion) porque su consulta
// es otra —líneas agrupadas por producto, no tarjetas de pedido—.

import Link from "next/link"
import { KanbanSquare, Layers, List } from "lucide-react"

export type OrdersVista = "tablero" | "lista" | "produccion"

const VISTAS = [
    { vista: "tablero", href: "/pedidos", label: "Tablero", Icon: KanbanSquare },
    { vista: "lista", href: "/pedidos?vista=lista", label: "Lista", Icon: List },
    { vista: "produccion", href: "/pedidos/produccion", label: "Producción", Icon: Layers },
] as const

export function ViewToggle({ vista }: { vista: OrdersVista }) {
    const base = "flex items-center gap-2 px-3 py-1.5 text-base rounded-md transition-colors"
    const on = "bg-background shadow-sm font-medium"
    const off = "text-muted-foreground hover:text-foreground"

    return (
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
            {VISTAS.map(({ vista: v, href, label, Icon }) => (
                <Link key={v} href={href} className={`${base} ${v === vista ? on : off}`}>
                    <Icon className="h-4 w-4" />
                    {label}
                </Link>
            ))}
        </div>
    )
}
