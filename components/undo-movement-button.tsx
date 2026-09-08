"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Undo2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { deshacerMovimiento } from "@/lib/operator-actions"

// Deshacer lo que uno acaba de cargar mal. Sin confirmación: la acción ya es el
// arrepentimiento, y volver a preguntar solo agrega un paso. Lo que sí hace es
// avisar en el toast que quedó registrado como corrección, para que nadie
// espere que el movimiento original desaparezca del historial.
export function UndoMovementButton({ movementId }: { movementId: number }) {
    const router = useRouter()
    const { toast } = useToast()
    const [pending, startTransition] = useTransition()
    const [listo, setListo] = useState(false)

    function onClick() {
        startTransition(async () => {
            const res = await deshacerMovimiento(movementId)
            if (!res.ok) {
                toast.error("No se pudo deshacer", { description: res.error })
                return
            }
            setListo(true)
            toast.success("Movimiento deshecho", {
                description: "Se registró el movimiento inverso para dejar el stock como estaba.",
            })
            router.refresh()
        })
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={pending || listo}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:no-underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
            <Undo2 className="h-3 w-3" />
            {pending ? "Deshaciendo…" : listo ? "Deshecho" : "Deshacer"}
        </button>
    )
}
