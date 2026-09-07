"use client"

// Las tres opciones de tema, compartidas por los menús de los tres shells
// (dashboard, pedidos y operador): mismo orden y mismas etiquetas en todas
// partes. Van derecho en el menú, sin submenú: en una ventana angosta el
// submenú no tiene lugar para abrirse al costado y queda inservible.

import { Monitor, MoonStar, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import {
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

export function ThemeMenuItems() {
    const { theme, setTheme } = useTheme()

    return (
        <>
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
        </>
    )
}
