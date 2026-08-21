"use client"

// Materiales del pedido: sección desplegable con el estado de stock al lado de
// cada uno, en vez de una lista muda arriba y un cartel de faltantes abajo.
// Desde acá se descuentan del inventario, con las cantidades sugeridas y
// editables.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChevronRight, Loader2, PackageMinus } from "lucide-react"
import { consumeOrderMaterials } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import type { MaterialNeed } from "@/lib/orders"

function Estado({ n }: { n: MaterialNeed }) {
    if (n.available === null) {
        return <span className="text-[12px] text-muted-foreground">fuera del inventario</span>
    }
    if (n.pending === 0) {
        return <span className="text-[12px] text-emerald-600">descontado</span>
    }
    if (n.available < n.pending) {
        return (
            <span className="text-[12px] text-destructive">
                faltan {n.pending - n.available} · hay {n.available}
            </span>
        )
    }
    return <span className="text-[12px] text-muted-foreground">hay {n.available}</span>
}

export function OrderMaterials({ orderId, needs }: { orderId: number; needs: MaterialNeed[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [abierto, setAbierto] = useState(true)
    const [dialogo, setDialogo] = useState(false)
    const [saving, setSaving] = useState(false)
    // Sugerencia: lo que falta descontar de cada material. Editable.
    const [cant, setCant] = useState<Record<number, number>>({})

    const descontables = needs.filter((n) => n.material_id !== null && n.pending > 0)
    const conFaltante = needs.filter((n) => n.available !== null && n.pending > n.available)
    const todoDescontado = needs.length > 0 && needs.every((n) => n.pending === 0)

    function abrirDialogo() {
        const inicial: Record<number, number> = {}
        for (const n of descontables) {
            // Sugerimos lo pendiente, pero nunca más de lo que hay.
            inicial[n.material_id!] = Math.min(n.pending, n.available ?? n.pending)
        }
        setCant(inicial)
        setDialogo(true)
    }

    async function descontar() {
        setSaving(true)
        const result = await consumeOrderMaterials(
            orderId,
            Object.entries(cant).map(([id, quantity]) => ({ material_id: Number(id), quantity })),
        )
        setSaving(false)
        if (result.error) {
            toast.error("No se pudo descontar", { description: result.error })
            return
        }
        toast.success(`${result.count} materiales descontados del inventario`)
        setDialogo(false)
        router.refresh()
    }

    if (needs.length === 0) return null

    return (
        <section>
            <div className="flex items-center gap-2 mb-2">
                <button
                    type="button"
                    onClick={() => setAbierto((v) => !v)}
                    className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                >
                    <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-90" : ""}`}
                    />
                    Materiales que necesitás
                    <span className="text-muted-foreground/60">({needs.length})</span>
                </button>

                {conFaltante.length > 0 && (
                    <span className="text-[12px] text-destructive">
                        {conFaltante.length} sin stock suficiente
                    </span>
                )}

                <div className="ml-auto no-print">
                    {todoDescontado ? (
                        <span className="text-[12px] text-emerald-600">Ya descontado del inventario</span>
                    ) : (
                        <Button variant="outline" size="sm" onClick={abrirDialogo} disabled={descontables.length === 0}>
                            <PackageMinus className="mr-1.5 h-3.5 w-3.5" />
                            Descontar del inventario
                        </Button>
                    )}
                </div>
            </div>

            {abierto && (
                <div className="border rounded-lg divide-y">
                    {needs.map((n) => (
                        <div key={n.material_id ?? n.label} className="flex items-center gap-4 px-4 py-2">
                            <span className="text-[15px] font-semibold tabular-nums w-14 shrink-0">
                                {n.required}
                            </span>
                            <span className="text-[14px] min-w-0 flex-1 truncate">{n.label}</span>
                            {n.consumed > 0 && n.pending > 0 && (
                                <span className="text-[12px] text-muted-foreground shrink-0">
                                    {n.consumed} ya descontados
                                </span>
                            )}
                            <span className="shrink-0 text-right w-40">
                                <Estado n={n} />
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={dialogo} onOpenChange={setDialogo}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Descontar del inventario</DialogTitle>
                    </DialogHeader>

                    <p className="text-[13px] text-muted-foreground -mt-2">
                        Se registra como una salida de stock por este pedido. Podés ajustar las cantidades.
                    </p>

                    <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                        {descontables.map((n) => {
                            const valor = cant[n.material_id!] ?? 0
                            const excede = n.available !== null && valor > n.available
                            return (
                                <div key={n.material_id} className="flex items-center gap-3 py-1">
                                    <Input
                                        type="number"
                                        min={0}
                                        max={n.available ?? undefined}
                                        value={valor}
                                        onChange={(e) =>
                                            setCant((c) => ({
                                                ...c,
                                                [n.material_id!]: Number(e.target.value),
                                            }))
                                        }
                                        className={`h-8 w-20 text-[13px] ${excede ? "border-destructive" : ""}`}
                                    />
                                    <span className="text-[13px] flex-1 min-w-0 truncate">{n.label}</span>
                                    <span className="text-[12px] text-muted-foreground shrink-0">
                                        necesita {n.pending} · hay {n.available ?? "—"}
                                    </span>
                                </div>
                            )
                        })}
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setDialogo(false)} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={descontar} disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Descontar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    )
}
