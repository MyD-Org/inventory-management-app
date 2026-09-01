"use client"

// Emitir el remito del pedido en Alegra.
//
// MISMO PASO PREVIO QUE LA FACTURA: se muestra qué va a decir el remito antes de
// emitirlo. Es un documento en la contabilidad real y se anula, no se borra.
//
// MÁS CHICO QUE EL DE FACTURA, a propósito: no hay importes ni total —el remito va
// en cero— ni términos ni notas. Lo único que se mira es qué sale y cuánto de cada
// cosa, que es lo que el depósito tiene que poder chequear contra la mercadería.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, RefreshCw, Truck, TriangleAlert } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Linea {
    alegraItemId: number
    name: string
    quantity: number
    description: string
}

interface Preview {
    lines: Linea[]
    warnings: string[]
    clientName: string | null
    clientId: number | null
}

export function RemissionButton({
    orderId,
    mode = "emitir",
}: {
    orderId: number
    /** "actualizar" = ya hay remito y el pedido cambió después. */
    mode?: "emitir" | "actualizar"
}) {
    const actualizando = mode === "actualizar"
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [preview, setPreview] = useState<Preview | null>(null)
    const [cargando, setCargando] = useState(false)
    const [emitiendo, setEmitiendo] = useState(false)

    async function abrir() {
        setCargando(true)
        try {
            const res = await fetch(`/api/pedidos/${orderId}/remito`)
            const data = await res.json()
            if (!res.ok) {
                toast.error("No se pudo calcular el remito", { description: data.error })
                return
            }
            setPreview(data)
            setOpen(true)
        } catch {
            toast.error("No se pudo calcular el remito")
        } finally {
            setCargando(false)
        }
    }

    async function emitir() {
        setEmitiendo(true)
        try {
            const res = await fetch(`/api/pedidos/${orderId}/remito`, {
                method: actualizando ? "PUT" : "POST",
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error(actualizando ? "No se pudo actualizar el remito" : "No se pudo emitir el remito", {
                    description: data.error,
                })
                return
            }
            const verbo = actualizando ? "actualizado" : "emitido"
            if (data.warnings?.length > 0) {
                toast.warning(`Remito ${data.remissionNumber ?? data.remissionId} ${verbo}`, {
                    description: data.warnings.join(" "),
                })
            } else {
                toast.success(`Remito ${data.remissionNumber ?? data.remissionId} ${verbo}`)
            }
            setOpen(false)
            router.refresh()
        } catch {
            toast.error(actualizando ? "No se pudo actualizar el remito" : "No se pudo emitir el remito")
        } finally {
            setEmitiendo(false)
        }
    }

    const sinCliente = preview != null && preview.clientId == null
    const sinLineas = preview != null && preview.lines.length === 0

    return (
        <>
            <Button variant="outline" size="sm" onClick={abrir} disabled={cargando} className="no-print">
                {cargando ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : actualizando ? (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                ) : (
                    <Truck className="mr-2 h-3.5 w-3.5" />
                )}
                {actualizando ? "Actualizar remito" : "Emitir remito"}
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl w-[calc(100%-2rem)] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>
                            {actualizando ? "Actualizar remito de " : "Remito para "}
                            {preview?.clientName ?? "el cliente"}
                        </DialogTitle>
                    </DialogHeader>

                    {preview && (
                        <div className="space-y-3 overflow-hidden">
                            <div className="rounded-md border divide-y">
                                {preview.lines.map((l, i) => (
                                    <div key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                                        <span className="tabular-nums font-medium w-8 shrink-0">{l.quantity}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium break-words">{l.name}</p>
                                            <p className="text-xs text-muted-foreground break-words">
                                                {l.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {sinLineas && (
                                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                                        No hay ninguna línea que se pueda remitir.
                                    </p>
                                )}
                            </div>

                            {preview.warnings.length > 0 && (
                                <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-2.5 space-y-1 overflow-hidden">
                                    {preview.warnings.map((w, i) => (
                                        <p
                                            key={i}
                                            className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300 break-words"
                                        >
                                            <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                                            {w}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <p className="text-xs text-muted-foreground px-1">
                                El remito sale sin importes.
                            </p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)} disabled={emitiendo}>
                            Cancelar
                        </Button>
                        <Button onClick={emitir} disabled={emitiendo || sinCliente || sinLineas}>
                            {emitiendo && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            {actualizando ? "Actualizar en Alegra" : "Emitir en Alegra"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
