"use client"

// Apuntar el pedido a un remito que YA estaba en Alegra.
//
// Mismo recorrido que vincular una factura (ver link-invoice-button.tsx): se pega
// la URL, se busca, se mira de quién es y recién ahí se vincula.
//
// LO QUE SE AGREGA ES CUÁNTO CUBRE. El pedido cuenta lo remitido línea por línea, y
// el papel vinculado tiene que sumar ahí o el pedido va a seguir diciendo que falta
// mercadería que ya salió. Arranca con todo lo pendiente —lo normal es que el
// remito a mano haya cubierto el pedido entero— y se baja lo que no nombra.

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Link2, Loader2, TriangleAlert } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface LineaEntrega {
    orderItemId: number
    product: string
    ordered: number
    delivered: number
    pending: number
}

interface Encontrado {
    id: number
    number: string | null
    clientName: string | null
    date: string | null
    clienteDistinto: boolean
    orderClientName: string | null
    delivery: LineaEntrega[]
}

export function LinkRemissionButton({ orderId }: { orderId: number }) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [ref, setRef] = useState("")
    const [encontrado, setEncontrado] = useState<Encontrado | null>(null)
    const [cantidades, setCantidades] = useState<Record<number, string>>({})
    const [buscando, setBuscando] = useState(false)
    const [vinculando, setVinculando] = useState(false)

    // La búsqueda en curso. Cerrar el diálogo la cancela: si no, la respuesta
    // llegaba después y tiraba un toast de un diálogo que ya no está.
    const busqueda = useRef<AbortController | null>(null)

    function cambiarAbierto(abierto: boolean) {
        // Vincular sí es una escritura: una vez mandada no se puede cancelar a
        // medias, así que mientras tanto el diálogo no se cierra.
        if (!abierto && vinculando) return
        if (!abierto) {
            busqueda.current?.abort()
            busqueda.current = null
            setBuscando(false)
            setEncontrado(null)
        }
        setOpen(abierto)
    }

    async function buscar() {
        if (!ref.trim()) return
        busqueda.current?.abort()
        const controller = new AbortController()
        busqueda.current = controller
        setBuscando(true)
        setEncontrado(null)
        try {
            const res = await fetch(
                `/api/pedidos/${orderId}/remito-existente?ref=${encodeURIComponent(ref.trim())}`,
                { signal: controller.signal },
            )
            const data = await res.json()
            if (controller.signal.aborted) return
            if (!res.ok) {
                toast.error("No se encontró el remito", { description: data.error })
                return
            }
            setEncontrado(data)
            setCantidades(
                Object.fromEntries(
                    (data.delivery as LineaEntrega[]).map((d) => [d.orderItemId, String(d.pending)]),
                ),
            )
        } catch {
            if (controller.signal.aborted) return
            toast.error("No se pudo buscar el remito")
        } finally {
            if (busqueda.current === controller) {
                busqueda.current = null
                setBuscando(false)
            }
        }
    }

    // El tope se aplica al tipear, como al remitir: más de lo pendiente sería
    // anotar mercadería que el pedido no pidió.
    const escribir = (l: LineaEntrega, texto: string) => {
        const n = Number(texto)
        const valor = Number.isFinite(n) && n > l.pending ? String(l.pending) : Number.isFinite(n) && n < 0 ? "0" : texto
        setCantidades((c) => ({ ...c, [l.orderItemId]: valor }))
    }

    const pendientes = (encontrado?.delivery ?? []).filter((l) => l.pending > 0)
    const seleccion = pendientes
        .map((l) => ({ orderItemId: l.orderItemId, quantity: Number(cantidades[l.orderItemId] ?? "") }))
        .filter((s) => Number.isFinite(s.quantity) && s.quantity > 0)
    const totalUnidades = seleccion.reduce((sum, s) => sum + s.quantity, 0)

    async function vincular() {
        setVinculando(true)
        try {
            const res = await fetch(`/api/pedidos/${orderId}/remito-existente`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ref: ref.trim(), items: seleccion }),
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error("No se pudo vincular", { description: data.error })
                return
            }
            toast.success(`Remito ${data.number ?? data.id} vinculado al pedido`)
            setOpen(false)
            setRef("")
            setEncontrado(null)
            router.refresh()
        } catch {
            toast.error("No se pudo vincular el remito")
        } finally {
            setVinculando(false)
        }
    }

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                className="no-print text-muted-foreground"
                onClick={() => setOpen(true)}
            >
                <Link2 className="mr-2 h-3.5 w-3.5" />
                Vincular existente
            </Button>

            <Dialog open={open} onOpenChange={cambiarAbierto}>
                <DialogContent className="max-w-lg w-[calc(100%-2rem)]">
                    <DialogHeader>
                        <DialogTitle>Vincular un remito de Alegra</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="ref-remito" className="text-sm">
                                URL del remito
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    id="ref-remito"
                                    value={ref}
                                    onChange={(e) => {
                                        setRef(e.target.value)
                                        setEncontrado(null)
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault()
                                            buscar()
                                        }
                                    }}
                                    placeholder="https://app.alegra.com/remission/view/id/1027"
                                />
                                <Button onClick={buscar} disabled={buscando || !ref.trim()}>
                                    {buscando && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                    Buscar
                                </Button>
                            </div>
                        </div>

                        {encontrado && (
                            <div className="rounded-md border divide-y text-sm">
                                <div className="flex justify-between gap-3 px-3 py-2">
                                    <span className="text-muted-foreground">Remito</span>
                                    <span className="font-medium tabular-nums">
                                        {encontrado.number ?? `#${encontrado.id}`}
                                    </span>
                                </div>
                                <div className="flex justify-between gap-3 px-3 py-2">
                                    <span className="text-muted-foreground">Cliente</span>
                                    <span className="font-medium text-right">{encontrado.clientName ?? "—"}</span>
                                </div>
                                <div className="flex justify-between gap-3 px-3 py-2">
                                    <span className="text-muted-foreground">Fecha</span>
                                    <span className="tabular-nums">{encontrado.date ?? "—"}</span>
                                </div>
                            </div>
                        )}

                        {encontrado?.clienteDistinto && (
                            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                                <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                                <span>
                                    Este remito es de <strong>{encontrado.clientName}</strong> y el pedido es
                                    de <strong>{encontrado.orderClientName}</strong>. Revisá que sea el correcto.
                                </span>
                            </p>
                        )}

                        {encontrado && (
                            <>
                                <p className="text-sm text-muted-foreground">
                                    Qué cantidades nombra este remito. Lo que dejes en cero queda sin remitir.
                                </p>
                                <div className="rounded-md border divide-y">
                                    {pendientes.map((l) => (
                                        <div key={l.orderItemId} className="flex items-center gap-2 px-3 py-2 text-sm">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium break-words">{l.product}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {l.delivered > 0
                                                        ? `Remitidas ${l.delivered} de ${l.ordered} · Pendientes ${l.pending}`
                                                        : `Pendientes ${l.pending}`}
                                                </p>
                                            </div>
                                            <Input
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                max={l.pending}
                                                step="any"
                                                className="h-8 w-20 shrink-0 text-right tabular-nums"
                                                value={cantidades[l.orderItemId] ?? ""}
                                                onChange={(e) => escribir(l, e.target.value)}
                                                aria-label={`Cantidad que cubre el remito de ${l.product}`}
                                            />
                                        </div>
                                    ))}
                                    {pendientes.length === 0 && (
                                        <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                                            El pedido ya está remitido por completo.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <DialogFooter className="sm:justify-between">
                        <span className="text-sm text-muted-foreground">
                            {encontrado && (
                                <>
                                    Cubre{" "}
                                    <span className="font-medium tabular-nums text-foreground">
                                        {totalUnidades} u.
                                    </span>
                                </>
                            )}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={() => cambiarAbierto(false)} disabled={vinculando}>
                                Cancelar
                            </Button>
                            <Button onClick={vincular} disabled={vinculando || !encontrado || seleccion.length === 0}>
                                {vinculando && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                Vincular al pedido
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
