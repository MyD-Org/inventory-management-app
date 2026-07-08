"use client"

import { Button } from "@/components/ui/button"
import { Printer, ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

// Barra de acciones de la vista imprimible. Se oculta al imprimir (clase .no-print).
export function PrintBar({ backHref }: { backHref: string }) {
    const router = useRouter()
    return (
        <div className="no-print flex items-center justify-between mb-6">
            <Button variant="outline" onClick={() => router.push(backHref)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver
            </Button>
            <Button onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimir / Guardar PDF
            </Button>
        </div>
    )
}
