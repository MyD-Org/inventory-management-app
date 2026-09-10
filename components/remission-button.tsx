"use client"

// Emitir un remito del pedido en Alegra.
//
// MISMO PASO PREVIO QUE LA FACTURA: se muestra qué va a decir el remito antes de
// emitirlo. Es un documento en la contabilidad real y se anula, no se borra.
//
// LA ENTREGA VA POR PARTES. El pedido puede tener varios remitos —4 luminarias hoy
// y 6 la semana que viene— así que el diálogo no pregunta "¿emitís?": pregunta
// CUÁNTO SALE de cada línea. Arranca con todo lo pendiente, que es el caso normal
// (el pedido sale completo), y quien remite baja lo que todavía no está armado.
// Es al revés que la devolución de materiales, que arranca vacía: ahí precargar el
// total invita a devolver de más, y acá lo que invita es a olvidarse de remitir.
//
// SIN IMPORTES NI TOTAL —el remito va en cero—, ni términos ni notas. Lo único que
// se mira es qué sale y cuánto de cada cosa, que es lo que el depósito tiene que
// poder chequear contra la mercadería.

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, RefreshCw, Truck, TriangleAlert } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { DeliveryState } from "@/lib/deliveries"

interface Linea {
    orderItemId: number
    alegraItemId: number
    name: string
    quantity: number
    description: string
}

interface LineaEntrega {
    orderItemId: number
    product: string
    ordered: number
    delivered: number
    pending: number
}

interface Preview {
    lines: Linea[]
    warnings: string[]
    clientName: string | null
    clientId: number | null
    delivery: LineaEntrega[]
    deliveryState: DeliveryState
}

export function RemissionButton({
    orderId,
    mode = "emitir",
    label,
}: {
    orderId: number
    /** "actualizar" = corregir el último remito, sin entregar nada nuevo. */
    mode?: "emitir" | "actualizar"
    /** Para distinguir el primer remito de los que siguen: "Remitir el resto". */
    label?: string
}) {
    const actualizando = mode === "actualizar"
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [preview, setPreview] = useState<Preview | null>(null)
    const [cargando, setCargando] = useState(false)
    const [recalculando, setRecalculando] = useState(false)
    const [emitiendo, setEmitiendo] = useState(false)
    // Cuánto sale de cada línea AHORA. Texto y no número: mientras se tipea, el
    // campo pasa por estados que no son un número todavía (vacío, "1.").
    const [cantidades, setCantidades] = useState<Record<number, string>>({})

    async function abrir() {
        setCargando(true)
        try {
            const res = await fetch(`/api/pedidos/${orderId}/remito${actualizando ? "?modo=actualizar" : ""}`)
            const data = await res.json()
            if (!res.ok) {
                toast.error("No se pudo calcular el remito", { description: data.error })
                return
            }
            setPreview(data)
            setCantidades(
                Object.fromEntries(
                    (data.delivery as LineaEntrega[]).map((d) => [d.orderItemId, String(d.pending)]),
                ),
            )
            setOpen(true)
        } catch {
            toast.error("No se pudo calcular el remito")
        } finally {
            setCargando(false)
        }
    }

    const parsear = (q: string) => {
        const n = Number(q)
        return Number.isFinite(n) ? n : NaN
    }

    const errorDe = (l: LineaEntrega): string | null => {
        const texto = cantidades[l.orderItemId] ?? ""
        if (texto.trim() === "") return null
        const n = parsear(texto)
        if (Number.isNaN(n) || n < 0) return "Cantidad inválida"
        if (n > l.pending) return `Quedan ${l.pending}`
        return null
    }

    const entrega = preview?.delivery ?? []
    const hayError = entrega.some((l) => errorDe(l) !== null)
    const seleccion = entrega
        .map((l) => ({ orderItemId: l.orderItemId, quantity: parsear(cantidades[l.orderItemId] ?? "") }))
        .filter((s) => !Number.isNaN(s.quantity) && s.quantity > 0)

    // Los renglones que van a Alegra dependen de las cantidades elegidas —los
    // agregados salen a razón de tantos por unidad—, así que se recalculan del
    // lado del servidor, que es donde vive la resolución contra el catálogo.
    // Con espera: se recalcula cuando quien carga dejó de tipear, no en cada tecla.
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        if (!open || actualizando || hayError || seleccion.length === 0) return
        const query = seleccion.map((s) => `${s.orderItemId}:${s.quantity}`).join(",")
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(async () => {
            setRecalculando(true)
            try {
                const res = await fetch(`/api/pedidos/${orderId}/remito?items=${encodeURIComponent(query)}`)
                const data = await res.json()
                if (res.ok) setPreview((p) => (p ? { ...p, lines: data.lines, warnings: data.warnings } : p))
            } catch {
                // La simulación es informativa: si falla, el diálogo sigue usable y
                // quien decide si se puede emitir es el POST.
            } finally {
                setRecalculando(false)
            }
        }, 400)
        return () => {
            if (timer.current) clearTimeout(timer.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, cantidades])

    async function emitir() {
        setEmitiendo(true)
        try {
            const res = await fetch(`/api/pedidos/${orderId}/remito`, {
                method: actualizando ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: actualizando ? undefined : JSON.stringify({ items: seleccion }),
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error(actualizando ? "No se pudo actualizar el remito" : "No se pudo emitir el remito", {
                    description: data.error,
                })
                return
            }
            const verbo = actualizando ? "actualizado" : "emitido"
            const nombre = `Remito ${data.remissionNumber ?? data.remissionId} ${verbo}`
            // Después de una entrega parcial lo que hace falta saber es cuánto
            // quedó adentro, no solo que el papel salió.
            const resto =
                !actualizando && data.deliveryState === "parcial"
                    ? "Quedó mercadería pendiente de entrega."
                    : null
            if (data.warnings?.length > 0) {
                toast.warning(nombre, { description: [resto, ...data.warnings].filter(Boolean).join(" ") })
            } else if (resto) {
                toast.success(nombre, { description: resto })
            } else {
                toast.success(nombre)
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
                {label ?? (actualizando ? "Actualizar remito" : "Emitir remito")}
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
                            {/* Cuánto sale de cada línea. En "actualizar" no se
                                elige nada: ese remito ya dijo cuánto salió y lo que
                                se corrige es el texto del renglón, no la cantidad. */}
                            {!actualizando && (
                                <div className="rounded-md border divide-y">
                                    {entrega.map((l) => {
                                        const error = errorDe(l)
                                        const entregado = l.delivered > 0
                                        return (
                                            <div
                                                key={l.orderItemId}
                                                className="flex items-center gap-3 px-3 py-2 text-sm"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium break-words">{l.product}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {l.pending === 0
                                                            ? "Ya se entregó completo"
                                                            : entregado
                                                              ? `${l.delivered} de ${l.ordered} entregadas · quedan ${l.pending}`
                                                              : `${l.ordered} pedidas`}
                                                    </p>
                                                </div>
                                                {l.pending > 0 ? (
                                                    <div className="shrink-0 text-right">
                                                        <Input
                                                            type="number"
                                                            inputMode="decimal"
                                                            min={0}
                                                            max={l.pending}
                                                            step="any"
                                                            className="h-8 w-20 text-right tabular-nums"
                                                            value={cantidades[l.orderItemId] ?? ""}
                                                            onChange={(e) =>
                                                                setCantidades((c) => ({
                                                                    ...c,
                                                                    [l.orderItemId]: e.target.value,
                                                                }))
                                                            }
                                                            aria-label={`Cuánto sale de ${l.product}`}
                                                        />
                                                        {error && (
                                                            <p className="mt-0.5 text-[0.7rem] text-destructive">
                                                                {error}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="shrink-0 text-xs text-muted-foreground">
                                                        —
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {entrega.length === 0 && (
                                        <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                                            El pedido no tiene líneas.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Y lo que va a decir el papel, ya resuelto contra el
                                catálogo de Alegra: es lo que el depósito chequea
                                contra la mercadería. */}
                            <div>
                                <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground px-1">
                                    Qué va a decir el remito
                                    {recalculando && <Loader2 className="h-3 w-3 animate-spin" />}
                                </p>
                                <div className="rounded-md border divide-y">
                                    {preview.lines.map((l, i) => (
                                        <div key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                                            <span className="tabular-nums font-medium w-8 shrink-0">
                                                {l.quantity}
                                            </span>
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
                        <Button
                            onClick={emitir}
                            disabled={
                                emitiendo ||
                                sinCliente ||
                                sinLineas ||
                                (!actualizando && (hayError || seleccion.length === 0))
                            }
                        >
                            {emitiendo && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            {actualizando ? "Actualizar en Alegra" : "Emitir en Alegra"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
