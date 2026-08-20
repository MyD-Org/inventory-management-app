"use client"

// Solo imprimir. El volver lo dan las migas de pan, no hace falta un botón más.

import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

export function PrintIconButton() {
    return (
        <Button variant="ghost" size="sm" onClick={() => window.print()} title="Imprimir la orden de trabajo">
            <Printer className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Imprimir</span>
        </Button>
    )
}
