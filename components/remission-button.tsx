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
// LA SALIDA VA POR PARTES. El pedido puede tener varios remitos —4 luminarias hoy
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
    variant = "boton",
}: {
    orderId: number
    /** "actualizar" = corregir el último remito, sin entregar nada nuevo. */
    mode?: "emitir" | "actualizar"
    /** Para distinguir el primer remito de los que siguen: "Remitir el resto". */
    label?: string
    /**
     * "link" = texto chico en vez de botón. Para corregir un papel ya emitido, que
     * sale de un aviso y no de una decisión: al lado del botón de remitir, del
     * mismo tamaño, parecían dos caminos entre los que hay que elegir.
     */
    variant?: "boton" | "link"
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
    // La última línea a la que se le recortó la cantidad por llegar al tope. El
    // campo cambia solo cuando pasa, y un número que cambia sin explicación se lee
    // como un error de la pantalla: por eso el renglón dice cuál es el máximo.
    const [topeada, setTopeada] = useState<number | null>(null)
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
            setTopeada(null)
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

    /**
     * Escribir la cantidad de una línea, sin dejar pasar más de lo pendiente.
     *
     * EL TOPE SE APLICA AL TIPEAR y no se avisa después: remitir 9 de 6 no es una
     * cantidad que haya que discutir, es mercadería que el pedido no pidió, y el
     * papel que la nombre queda mal emitido. Dejar escribir 9 para rechazarlo
     * recién al confirmar es hacerle perder el viaje a quien carga.
     *
     * Vacío se deja pasar: es "de esta línea no sale nada", que es una respuesta
     * válida mientras se completa el resto (sacar la línea con la X es lo mismo,
     * dicho más claro).
     */
    const escribir = (l: LineaEntrega, texto: string) => {
        const n = parsear(texto)
        const recortada = !Number.isNaN(n) && n > l.pending
        setTopeada(recortada ? l.orderItemId : (t) => (t === l.orderItemId ? null : t))
        setCantidades((c) => ({
            ...c,
            [l.orderItemId]: recortada ? String(l.pending) : Number.isFinite(n) && n < 0 ? "0" : texto,
        }))
    }

    // Con el tope aplicado al tipear, lo único que puede quedar mal escrito es algo
    // que no es un número. El chequeo contra lo pendiente se deja igual: es la red
    // por si alguna vez entra un valor sin pasar por escribir().
    const errorDe = (l: LineaEntrega): string | null => {
        const texto = cantidades[l.orderItemId] ?? ""
        if (texto.trim() === "") return null
        const n = parsear(texto)
        if (Number.isNaN(n) || n < 0) return "Cantidad inválida"
        if (n > l.pending) return `Máximo ${l.pending}`
        return null
    }

    // Lo que ya está remitido entero no se lista: no hay nada que decidir sobre esa
    // línea y ocuparía un renglón que se lee igual que los que sí se pueden tocar.
    // Se nombra abajo, en una línea, para que no parezca que el pedido perdió un ítem.
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
        if (!open || actualizando) return
        // Los avisos que hay en pantalla son de la selección ANTERIOR: apenas
        // cambia algo dejan de ser ciertos, así que se van ya, antes de esperar la
        // respuesta. Dejarlos describía una selección que quien mira ya cambió.
        setPreview((p) => (p ? { ...p, warnings: [] } : p))
        if (hayError || seleccion.length === 0) return

        const query = seleccion.map((s) => `${s.orderItemId}:${s.quantity}`).join(",")
        if (timer.current) clearTimeout(timer.current)
        // Se cancela la consulta anterior: dos tecleos seguidos dejaban dos GET en
        // vuelo y ganaba el que contestara último, que no es el que se está viendo.
        const abort = new AbortController()
        timer.current = setTimeout(async () => {
            setRevisando(true)
            try {
                const res = await fetch(
                    `/api/pedidos/${orderId}/remito?items=${encodeURIComponent(query)}`,
                    { signal: abort.signal },
                )
                const data = await res.json()
                if (res.ok) setPreview((p) => (p ? { ...p, lines: data.lines, warnings: data.warnings } : p))
            } catch {
                // El chequeo es informativo: si falla —o si se canceló porque
                // siguieron tipeando— el diálogo sigue usable y quien decide si se
                // puede emitir es el POST.
            } finally {
                setRevisando(false)
            }
        }, 400)
        return () => {
            if (timer.current) clearTimeout(timer.current)
            abort.abort()
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
            // Después de un remito parcial lo que hace falta saber es cuánto quedó
            // sin remitir, no solo que el papel salió.
            const resto =
                !actualizando && data.deliveryState === "parcial"
                    ? "El pedido mantiene unidades sin remitir."
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
            {variant === "link" ? (
                <button
                    type="button"
                    onClick={abrir}
                    disabled={cargando}
                    className="no-print inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-60"
                >
                    {cargando && <Loader2 className="h-3 w-3 animate-spin" />}
                    {label ?? (actualizando ? "Actualizar remito" : "Emitir remito")}
                </button>
            ) : (
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
            )}

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
                                        Se actualiza el detalle del remito ya emitido. Las cantidades no se
                                        modifican: una entrega adicional requiere un remito nuevo.
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
                                        Cantidades a remitir. Lo que quede fuera del remito queda
                                        sin remitir.
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
                                                                ? `Remitidas ${l.delivered} de ${l.ordered} · Pendientes ${l.pending}`
                                                                : `Pendientes ${l.pending}`}
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
                                                            onChange={(e) => escribir(l, e.target.value)}
                                                            aria-label={`Cantidad a remitir de ${l.product}`}
                                                        />
                                                        {error ? (
                                                            <p className="mt-0.5 text-[0.7rem] text-destructive">
                                                                {error}
                                                            </p>
                                                        ) : (
                                                            topeada === l.orderItemId && (
                                                                <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                                                                    Máximo {l.pending}
                                                                </p>
                                                            )
                                                        )}
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                                        onClick={() =>
                                                            setSacadas((s) => [...s, l.orderItemId])
                                                        }
                                                        aria-label={`Excluir ${l.product} del remito`}
                                                        title="Excluir del remito"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                        {enElRemito.length === 0 && (
                                            <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                                                Ningún producto seleccionado.
                                            </p>
                                        )}
                                    </div>

                                    {/* Sacar la fila equivocada no puede costar
                                        cerrar el diálogo y empezar de nuevo. */}
                                    {sacadas.length > 0 && (
                                        <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                                            <span>
                                                {sacadas.length === 1
                                                    ? "1 producto excluido del remito."
                                                    : `${sacadas.length} productos excluidos del remito.`}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setSacadas([])}
                                                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                            >
                                                <RotateCcw className="h-3 w-3" />
                                                Restaurar
                                            </button>
                                        </div>
                                    )}

                                    {entregadas.length > 0 && (
                                        <p className="px-1 text-xs text-muted-foreground">
                                            Remitidos por completo:{" "}
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
                                    Total a remitir{" "}
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
