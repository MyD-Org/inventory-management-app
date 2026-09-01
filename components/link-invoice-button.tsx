"use client"

// Apuntar el pedido a una factura que YA estaba en Alegra.
//
// PASA SEGUIDO: la factura se hizo en Alegra antes de que el pedido existiera en
// la app. Emitir otra sería facturarle dos veces al cliente; lo que hace falta es
// apuntar a la que ya está.
//
// SE BUSCA ANTES DE VINCULAR, siempre. Vincular la factura equivocada no rompe
// nada en Alegra, pero deja al pedido diciendo que se cobró algo que no se cobró,
// y eso se descubre tarde. Primero se muestra de quién es, de cuándo y por cuánto.

import { useState } from "react"
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
import { formatArs } from "@/components/budget-editor"

interface Encontrada {
    id: number
    number: string | null
    clientName: string | null
    date: string | null
    total: number | null
    status: string | null
    clienteDistinto: boolean
    orderClientName: string | null
    sin_importes?: boolean
}

export function LinkInvoiceButton({ orderId }: { orderId: number }) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [ref, setRef] = useState("")
    const [encontrada, setEncontrada] = useState<Encontrada | null>(null)
    const [buscando, setBuscando] = useState(false)
    const [vinculando, setVinculando] = useState(false)

    async function buscar() {
        if (!ref.trim()) return
        setBuscando(true)
        setEncontrada(null)
        try {
            const res = await fetch(
                `/api/pedidos/${orderId}/factura-existente?ref=${encodeURIComponent(ref.trim())}`,
            )
            const data = await res.json()
            if (!res.ok) {
                toast.error("No se encontró la factura", { description: data.error })
                return
            }
            setEncontrada(data)
        } catch {
            toast.error("No se pudo buscar la factura")
        } finally {
            setBuscando(false)
        }
    }

    async function vincular() {
        setVinculando(true)
        try {
            const res = await fetch(`/api/pedidos/${orderId}/factura-existente`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ref: ref.trim() }),
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error("No se pudo vincular", { description: data.error })
                return
            }
            toast.success(`Factura ${data.number ?? data.id} vinculada al pedido`)
            setOpen(false)
            setRef("")
            setEncontrada(null)
            router.refresh()
        } catch {
            toast.error("No se pudo vincular la factura")
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

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg w-[calc(100%-2rem)]">
                    <DialogHeader>
                        <DialogTitle>Vincular una factura de Alegra</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="ref-factura" className="text-sm">
                                Número o URL de la factura
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    id="ref-factura"
                                    value={ref}
                                    onChange={(e) => {
                                        setRef(e.target.value)
                                        setEncontrada(null)
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault()
                                            buscar()
                                        }
                                    }}
                                    placeholder="1612, L533 o https://app.alegra.com/invoice/view/id/2618"
                                />
                                <Button onClick={buscar} disabled={buscando || !ref.trim()}>
                                    {buscando && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                    Buscar
                                </Button>
                            </div>
                            {/* El número solo se busca entre las recientes: se dice
                                acá, antes de que alguien pruebe con una de 2019 y
                                concluya que el buscador no anda. */}
                            <p className="text-xs text-muted-foreground">
                                El número se busca entre las facturas más recientes. Si es vieja,
                                abrila en Alegra y pegá la URL.
                            </p>
                        </div>

                        {encontrada && (
                            <div className="rounded-md border divide-y text-sm">
                                <div className="flex justify-between gap-3 px-3 py-2">
                                    <span className="text-muted-foreground">Factura</span>
                                    <span className="font-medium tabular-nums">
                                        {encontrada.number ?? `#${encontrada.id}`}
                                    </span>
                                </div>
                                <div className="flex justify-between gap-3 px-3 py-2">
                                    <span className="text-muted-foreground">Cliente</span>
                                    <span className="font-medium text-right">
                                        {encontrada.clientName ?? "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between gap-3 px-3 py-2">
                                    <span className="text-muted-foreground">Fecha</span>
                                    <span className="tabular-nums">{encontrada.date ?? "—"}</span>
                                </div>
                                {encontrada.total != null && (
                                    <div className="flex justify-between gap-3 px-3 py-2">
                                        <span className="text-muted-foreground">Total</span>
                                        <span className="font-medium tabular-nums">
                                            {formatArs(encontrada.total)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* No bloquea: una factura puede estar a nombre de la casa
                            matriz y el pedido a nombre de la sucursal. Pero es lo
                            primero que hay que mirar antes de confirmar. */}
                        {encontrada?.clienteDistinto && (
                            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                                <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                                <span>
                                    Esta factura es de <strong>{encontrada.clientName}</strong> y el
                                    pedido es de <strong>{encontrada.orderClientName}</strong>.
                                    Revisá que sea la correcta.
                                </span>
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)} disabled={vinculando}>
                            Cancelar
                        </Button>
                        <Button onClick={vincular} disabled={vinculando || !encontrada}>
                            {vinculando && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Vincular al pedido
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
