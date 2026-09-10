"use client"

// Emitir un remito del pedido en Alegra.
//
// MISMO PASO PREVIO QUE LA FACTURA: se muestra qué va a decir el remito antes de
// emitirlo. Es un documento en la contabilidad real y se anula, no se borra.
//
// UNA SOLA LISTA, la del pedido. Antes había dos —los productos con su cantidad
// arriba y "qué va a decir el remito" abajo, ya resuelto contra el catálogo de
// Alegra— y era la misma mercadería dicha dos veces con nombres apenas distintos:
// quien remite tenía que leer las dos para convencerse de que decían lo mismo. La
// resolución contra el catálogo sigue pasando del lado del servidor —es la que
// arma el papel— pero no es una decisión de quien remite, así que no se muestra;
// lo único que se avisa es cuando una línea NO se pudo resolver, porque eso sí
// cambia lo que sale.
//
// LA ENTREGA VA POR PARTES. El pedido puede tener varios remitos —4 luminarias hoy
// y 6 la semana que viene— así que el diálogo no pregunta "¿emitís?": pregunta
// CUÁNTO SALE de cada línea. Arranca con todo lo pendiente, que es el caso normal
// (el pedido sale completo), y de ahí se baja la cantidad o se saca la línea
// entera con la X. Es al revés que la devolución de materiales, que arranca vacía:
// ahí precargar el total invita a devolver de más, y acá lo que invita es a
// olvidarse de remitir.
//
// SIN IMPORTES NI TOTAL EN PLATA: el remito va en cero. El total que sí se muestra
// es en unidades, que es lo que se cuenta contra la mercadería al cargarla.

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
import { Loader2, RefreshCw, RotateCcw, Truck, TriangleAlert, X } from "lucide-react"
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
    const [revisando, setRevisando] = useState(false)
    const [emitiendo, setEmitiendo] = useState(false)
    // Cuánto sale de cada línea AHORA. Texto y no número: mientras se tipea, el
    // campo pasa por estados que no son un número todavía (vacío, "1.").
    const [cantidades, setCantidades] = useState<Record<number, string>>({})
    // Las líneas que se sacaron del remito con la X. Se guardan en vez de borrarse
    // para poder volver a meterlas: sacar la fila equivocada no puede costar
    // cerrar el diálogo y empezar de nuevo.
    const [sacadas, setSacadas] = useState<number[]>([])

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
            setSacadas([])
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
        if (n > l.pending) return `Solo quedan ${l.pending}`
        return null
    }

    // Lo que ya salió entero no se lista: no hay nada que decidir sobre esa línea y
    // ocuparía un renglón que se lee igual que los que sí se pueden tocar. Se
    // nombra abajo, en una línea, para que no parezca que el pedido perdió un ítem.
    const entregadas = (preview?.delivery ?? []).filter((l) => l.pending <= 0)
    const enElRemito = (preview?.delivery ?? []).filter(
        (l) => l.pending > 0 && !sacadas.includes(l.orderItemId),
    )

    const hayError = enElRemito.some((l) => errorDe(l) !== null)
    const seleccion = enElRemito
        .map((l) => ({ orderItemId: l.orderItemId, quantity: parsear(cantidades[l.orderItemId] ?? "") }))
        .filter((s) => !Number.isNaN(s.quantity) && s.quantity > 0)
    const totalUnidades = seleccion.reduce((sum, s) => sum + s.quantity, 0)

    // Qué líneas no se van a poder resolver contra el catálogo de Alegra: eso no se
    // ve mirando el pedido y cambia lo que sale en el papel, así que se pregunta al
    // servidor cada vez que cambia la selección. Con espera, para no consultar en
    // cada tecla. Es lo ÚNICO que se trae: los renglones ya resueltos no se
    // muestran (ver el comentario de arriba).
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        if (!open || actualizando || hayError || seleccion.length === 0) return
        const query = seleccion.map((s) => `${s.orderItemId}:${s.quantity}`).join(",")
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(async () => {
            setRevisando(true)
            try {
                const res = await fetch(`/api/pedidos/${orderId}/remito?items=${encodeURIComponent(query)}`)
                const data = await res.json()
                if (res.ok) setPreview((p) => (p ? { ...p, lines: data.lines, warnings: data.warnings } : p))
            } catch {
                // El chequeo es informativo: si falla, el diálogo sigue usable y
                // quien decide si se puede emitir es el POST.
            } finally {
                setRevisando(false)
            }
        }, 400)
        return () => {
            if (timer.current) clearTimeout(timer.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, cantidades, sacadas])

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
    // En "actualizar" el remito ya dijo qué salió: lo que puede faltar son los
    // renglones, no la selección.
    const sinNada = actualizando ? (preview?.lines.length ?? 0) === 0 : seleccion.length === 0

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
                <DialogContent className="max-w-xl w-[calc(100%-2rem)] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>
                            {actualizando ? "Actualizar remito de " : "Remito para "}
                            {preview?.clientName ?? "el cliente"}
                        </DialogTitle>
                    </DialogHeader>

                    {preview && (
                        <div className="space-y-3 overflow-hidden">
                            {actualizando ? (
                                // Actualizar no entrega nada nuevo: corrige lo que
                                // el papel dice de cada producto. No hay nada que
                                // elegir, así que la lista es de solo lectura.
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        Se corrige lo que dice el remito de cada producto. Las cantidades
                                        no cambian: si lo que cambió es cuánto sale, va en un remito nuevo.
                                    </p>
                                    <div className="rounded-md border divide-y">
                                        {preview.lines.map((l, i) => (
                                            <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                                                <span className="min-w-0 flex-1 font-medium break-words">
                                                    {l.name}
                                                </span>
                                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                                    {l.quantity}
                                                </span>
                                            </div>
                                        ))}
                                        {preview.lines.length === 0 && (
                                            <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                                                No hay ninguna línea que se pueda remitir.
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        Qué sale en este remito. Cambiá la cantidad o sacá el producto que
                                        todavía no está listo: lo que quede afuera sigue pendiente de entrega.
                                    </p>

                                    <div className="rounded-md border divide-y">
                                        {enElRemito.map((l) => {
                                            const error = errorDe(l)
                                            return (
                                                <div
                                                    key={l.orderItemId}
                                                    className="flex items-center gap-2 px-3 py-2 text-sm"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-medium break-words">{l.product}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {l.delivered > 0
                                                                ? `${l.delivered} de ${l.ordered} ya entregadas · quedan ${l.pending}`
                                                                : `${l.ordered} pedidas`}
                                                        </p>
                                                    </div>
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
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                                        onClick={() =>
                                                            setSacadas((s) => [...s, l.orderItemId])
                                                        }
                                                        aria-label={`Sacar ${l.product} del remito`}
                                                        title="Sacar del remito"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                        {enElRemito.length === 0 && (
                                            <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                                                No quedó ningún producto en el remito.
                                            </p>
                                        )}
                                    </div>

                                    {/* Sacar la fila equivocada no puede costar
                                        cerrar el diálogo y empezar de nuevo. */}
                                    {sacadas.length > 0 && (
                                        <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                                            <span>
                                                {sacadas.length === 1
                                                    ? "Sacaste 1 producto del remito."
                                                    : `Sacaste ${sacadas.length} productos del remito.`}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setSacadas([])}
                                                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                            >
                                                <RotateCcw className="h-3 w-3" />
                                                Volver a incluirlos
                                            </button>
                                        </div>
                                    )}

                                    {entregadas.length > 0 && (
                                        <p className="px-1 text-xs text-muted-foreground">
                                            Ya se entregó completo:{" "}
                                            {entregadas.map((l) => l.product).join(", ")}.
                                        </p>
                                    )}
                                </>
                            )}

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
                        </div>
                    )}

                    <DialogFooter className="sm:justify-between">
                        {/* El total va en el pie, al lado del botón: es el número que
                            se cuenta contra la mercadería antes de darle emitir. Con
                            una cantidad inválida arriba no se muestra: sumar una
                            línea que el server va a rechazar da un total que nunca
                            va a salir en el papel. */}
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            {!actualizando && preview && !hayError && (
                                <>
                                    Sale{" "}
                                    <span className="font-medium tabular-nums text-foreground">
                                        {totalUnidades} u.
                                    </span>
                                </>
                            )}
                            {revisando && <Loader2 className="h-3 w-3 animate-spin" />}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={() => setOpen(false)} disabled={emitiendo}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={emitir}
                                disabled={emitiendo || sinCliente || sinNada || (!actualizando && hayError)}
                            >
                                {emitiendo && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                {actualizando ? "Actualizar en Alegra" : "Emitir en Alegra"}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
