"use client"

// Materiales del pedido: sección desplegable con el estado de stock al lado de
// cada uno, en vez de una lista muda arriba y un cartel de faltantes abajo.
// Desde acá se descuentan del inventario, con las cantidades sugeridas y
// editables.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChevronRight, PackageMinus } from "lucide-react"
import { ConsumeMaterialsForm } from "@/components/consume-materials-form"
import { useToast } from "@/hooks/use-toast"
import type { MaterialNeed } from "@/lib/orders"

function Estado({ n }: { n: MaterialNeed }) {
    if (n.available === null) {
        return <span className="text-xs text-muted-foreground">fuera del inventario</span>
    }
    if (n.pending === 0) {
        return <span className="text-xs text-emerald-600">descontado</span>
    }
    if (n.available < n.pending) {
        return (
            <span className="text-xs text-destructive">
                faltan {n.pending - n.available} · hay {n.available}
            </span>
        )
    }
    return <span className="text-xs text-muted-foreground">hay {n.available}</span>
}

export function OrderMaterials({ orderId, needs }: { orderId: number; needs: MaterialNeed[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [abierto, setAbierto] = useState(true)
    const [dialogo, setDialogo] = useState(false)

    const descontables = needs.filter((n) => n.material_id !== null && n.pending > 0)
    const conFaltante = needs.filter((n) => n.available !== null && n.pending > n.available)
    const todoDescontado = needs.length > 0 && needs.every((n) => n.pending === 0)

    if (needs.length === 0) return null

    return (
        <section>
            <div className="flex items-center gap-2 mb-2">
                <button
                    type="button"
                    onClick={() => setAbierto((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                    <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-90" : ""}`}
                    />
                    Materiales que necesitás
                    <span className="text-muted-foreground/60">({needs.length})</span>
                </button>

                {conFaltante.length > 0 && (
                    <span className="text-xs text-destructive">
                        {conFaltante.length} sin stock suficiente
                    </span>
                )}

                <div className="ml-auto no-print">
                    {todoDescontado ? (
                        <span className="text-xs text-emerald-600">Ya descontado del inventario</span>
                    ) : (
                        <Button variant="outline" size="sm" onClick={() => setDialogo(true)} disabled={descontables.length === 0}>
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
                            <span className="text-base font-semibold tabular-nums w-14 shrink-0">
                                {n.required}
                            </span>
                            <span className="text-sm min-w-0 flex-1 truncate">{n.label}</span>
                            {n.consumed > 0 && n.pending > 0 && (
                                <span className="text-xs text-muted-foreground shrink-0">
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

                    <p className="text-sm text-muted-foreground -mt-2">
                        Se registra como una salida de stock por este pedido. Podés ajustar las
                        cantidades, quitar filas o agregar otro material.
                    </p>

                    <ConsumeMaterialsForm
                        orderId={orderId}
                        needs={needs}
                        onCancel={() => setDialogo(false)}
                        onDone={() => {
                            setDialogo(false)
                            router.refresh()
                        }}
                    />
                </DialogContent>
            </Dialog>
        </section>
    )
}
