"use client"

// Emitir la factura del pedido en Alegra. Solo lo monta el admin.
//
// SIEMPRE muestra antes qué se va a facturar. Emitir es irreversible del lado de
// Alegra —una factura se anula, no se borra— así que el paso de simulación no es
// opcional: se ve el detalle de cada renglón, el total y qué quedó afuera, y
// recién ahí se confirma.

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Loader2, TriangleAlert } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { formatArs } from "@/components/budget-editor"
import { updateOrderFields } from "@/lib/order-actions"

interface Linea {
    alegraItemId: number
    name: string
    quantity: number
    price: number
    description: string
    match: "variante" | "base" | "agregado"
}

interface Preview {
    lines: Linea[]
    warnings: string[]
    total: number
    clientName: string | null
    clientId: number | null
    numberTemplate: { id: number; name: string } | null
    terms: string | null
    notes: string | null
}

export function InvoiceButton({ orderId }: { orderId: number }) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [preview, setPreview] = useState<Preview | null>(null)
    const [terms, setTerms] = useState("")
    const [notes, setNotes] = useState("")
    const [cargando, setCargando] = useState(false)
    const [emitiendo, setEmitiendo] = useState(false)

    // Guardamos en el pedido a medida que escribe, así persiste si cierra el modal.
    const saveFields = useDebouncedCallback(async (nextTerms: string, nextNotes: string) => {
        await updateOrderFields(orderId, {
            invoice_terms: nextTerms.trim() || null,
            invoice_notes: nextNotes.trim() || null,
        })
    }, 600)

    useEffect(() => {
        if (preview) {
            setTerms(preview.terms ?? "")
            setNotes(preview.notes ?? "")
        }
    }, [preview])

    async function abrir() {
        setCargando(true)
        try {
            const res = await fetch(`/api/pedidos/${orderId}/facturar`)
            const data = await res.json()
            if (!res.ok) {
                toast.error("No se pudo calcular la factura", { description: data.error })
                return
            }
            setPreview(data)
            setOpen(true)
        } catch {
            toast.error("No se pudo calcular la factura")
        } finally {
            setCargando(false)
        }
    }

    async function emitir() {
        setEmitiendo(true)
        try {
            // Aseguramos que el último valor quede guardado antes de emitir.
            await updateOrderFields(orderId, {
                invoice_terms: terms.trim() || null,
                invoice_notes: notes.trim() || null,
            })
            const res = await fetch(`/api/pedidos/${orderId}/facturar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ terms, notes }),
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error("No se pudo emitir", { description: data.error })
                return
            }
            if (data.invoiceId == null) {
                toast.error("No se emitió", { description: data.warnings?.[0] ?? "No había nada que facturar." })
                return
            }
            // Salió con avisos: se emitió, pero algo quedó afuera y hay que mirarlo.
            if (data.warnings?.length > 0) {
                toast.warning(`Factura ${data.invoiceNumber ?? data.invoiceId} emitida`, {
                    description: data.warnings.join(" "),
                })
            } else {
                toast.success(`Factura ${data.invoiceNumber ?? data.invoiceId} emitida`)
            }
            setOpen(false)
            router.refresh()
        } catch {
            toast.error("No se pudo emitir la factura")
        } finally {
            setEmitiendo(false)
        }
    }

    const sinCliente = preview != null && preview.clientId == null
    const sinLineas = preview != null && preview.lines.length === 0

    return (
        <>
            <Button variant="outline" size="sm" onClick={abrir} disabled={cargando} className="no-print">
                {cargando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-2 h-3.5 w-3.5" />}
                Emitir factura
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl w-[calc(100%-2rem)] overflow-hidden">
                    <DialogHeader className="flex flex-row items-start justify-between gap-4">
                        <DialogTitle>Factura para {preview?.clientName ?? "el cliente"}</DialogTitle>
                        {preview?.numberTemplate && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                                N: {preview.numberTemplate.name}
                            </span>
                        )}
                    </DialogHeader>

                    {preview && (
                        <div className="space-y-3 overflow-hidden">
                            <div className="rounded-md border divide-y">
                                {preview.lines.map((l, i) => (
                                    <div key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                                        <span className="tabular-nums font-medium w-8 shrink-0">{l.quantity}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium break-words">{l.name}</p>
                                            <p className="text-xs text-muted-foreground break-words">{l.description}</p>
                                        </div>
                                        {/* Cómo se resolvió. 'base' quiere decir que el color
                                            pedido no existe como producto y se facturó el
                                            genérico de la familia: mismo precio, menos detalle. */}
                                        {l.match === "base" && (
                                            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                                sin color
                                            </span>
                                        )}
                                        <span className="tabular-nums shrink-0 text-right w-24">
                                            {formatArs(l.price * l.quantity)}
                                        </span>
                                    </div>
                                ))}
                                {sinLineas && (
                                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                                        No hay ninguna línea que se pueda facturar.
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-between text-base font-semibold px-1">
                                <span>Total</span>
                                <span className="tabular-nums">{formatArs(preview.total)}</span>
                            </div>

                            {preview.warnings.length > 0 && (
                                <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-2.5 space-y-1 overflow-hidden">
                                    {preview.warnings.map((w, i) => (
                                        <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300 break-words">
                                            <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                                            {w}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className="space-y-3 pt-1">
                                <div className="space-y-1.5">
                                    <Label htmlFor="invoice-terms" className="text-sm">
                                        Términos y condiciones
                                    </Label>
                                    <Textarea
                                        id="invoice-terms"
                                        value={terms}
                                        onChange={(e) => {
                                            setTerms(e.target.value)
                                            saveFields(e.target.value, notes)
                                        }}
                                        placeholder="Ej: Pago a 30 días..."
                                        rows={2}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="invoice-notes" className="text-sm">
                                        Notas de factura
                                    </Label>
                                    <Textarea
                                        id="invoice-notes"
                                        value={notes}
                                        onChange={(e) => {
                                            setNotes(e.target.value)
                                            saveFields(terms, e.target.value)
                                        }}
                                        placeholder="Ej: Retira en depósito..."
                                        rows={2}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)} disabled={emitiendo}>
                            Cancelar
                        </Button>
                        <Button onClick={emitir} disabled={emitiendo || sinCliente || sinLineas}>
                            {emitiendo && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Emitir en Alegra
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
