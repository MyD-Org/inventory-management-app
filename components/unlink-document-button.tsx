"use client"

// Soltar una factura o un remito del pedido.
//
// NO ANULA NADA EN ALEGRA: el documento sigue ahí. Lo único que cambia es que el
// pedido deja de apuntarle. Por eso se confirma diciendo exactamente eso: quien
// aprieta un tacho al lado de un número de factura puede creer que la está
// borrando de la contabilidad, y no.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function UnlinkDocumentButton({
    url,
    doc,
    number,
}: {
    /** El endpoint DELETE, con su query si hace falta. */
    url: string
    doc: "factura" | "remito"
    number: string
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [soltando, setSoltando] = useState(false)
    const nombre = `${doc === "factura" ? "la factura" : "el remito"} ${number}`

    async function desvincular() {
        setSoltando(true)
        try {
            const res = await fetch(url, { method: "DELETE" })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                toast.error("No se pudo desvincular", { description: data.error })
                return
            }
            toast.success(`${doc === "factura" ? "Factura" : "Remito"} ${number} desvinculado del pedido`)
            setOpen(false)
            router.refresh()
        } catch {
            toast.error("No se pudo desvincular")
        } finally {
            setSoltando(false)
        }
    }

    return (
        <>
            {/* Una X que aparece al pasar por el renglón (el padre lleva `group`):
                es una acción que se usa poco y no tiene que competir con el número.
                En pantallas sin mouse no hay "pasar por encima", así que ahí se ve
                siempre. El diálogo de abajo es la segunda pregunta. */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                title={`Desvincular ${nombre}`}
                aria-label={`Desvincular ${nombre}`}
                className="no-print inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
                <X className="h-3.5 w-3.5" />
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md w-[calc(100%-2rem)]">
                    <DialogHeader>
                        <DialogTitle>¿Desvincular {nombre}?</DialogTitle>
                        <DialogDescription>
                            {doc === "factura"
                                ? "Se quitará la vinculación de la factura con este pedido. Luego podrá emitirse o vincularse otra."
                                : "Se quitará la vinculación del remito con este pedido y sus unidades volverán a figurar como pendientes de remitir."}{" "}
                            El documento no se modifica en Alegra: permanece emitido y, de ser necesario,
                            deberá anularse desde allí.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)} disabled={soltando}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={desvincular} disabled={soltando}>
                            {soltando && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Desvincular
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
