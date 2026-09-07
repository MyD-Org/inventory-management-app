"use client"

// El control del tema es SIEMPRE el mismo menú desplegable con las tres
// opciones (Claro / Oscuro / El del sistema), en los tres shells. Antes el
// dashboard tenía un botón que alternaba claro/oscuro sin opción "sistema",
// y cada shell resolvía el tema a su manera.

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun, ChevronDown } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeMenuItems } from "@/components/theme-menu-items"

export function ThemeToggle() {
    const { theme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Hasta montar no se sabe el tema (el server no lo ve): ícono genérico
    // para que el primer render coincida con el HTML del server.
    const Icono = !mounted ? Sun : theme === "dark" ? Moon : theme === "light" ? Sun : Monitor

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" title="Cambiar apariencia">
                    <Icono className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
                <ThemeMenuItems />
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
