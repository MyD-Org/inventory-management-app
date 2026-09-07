"use client"

import { useState } from "react"
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import { StockMovementDialog } from "@/components/stock-movement-dialog"

interface Material {
    id: number
    name: string
    barcode: string
    current_stock?: number | string
    unit_of_measure?: string
    unit_cost?: number | string | null
}

// Los dos botones del inicio del operador. Abren el MISMO modal que el atajo del
// sidebar del admin (StockMovementDialog): no hay página dedicada de entrada ni
// de salida para este rol. Al guardar, el modal hace router.refresh() y la lista
// de movimientos recientes de abajo se actualiza sola.
export function OperatorStockActions({ materials }: { materials: Material[] }) {
    const [dialog, setDialog] = useState<"entrada" | "salida" | null>(null)

    return (
        <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={() => setDialog("entrada")}
                    className="flex items-center gap-3.5 rounded-lg border bg-card p-5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <ArrowDownToLine className="h-5 w-5 text-foreground" />
                    </span>
                    <span>
                        <span className="block font-semibold">Agregar al stock</span>
                        <span className="block text-sm text-muted-foreground">Entrada de materiales</span>
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setDialog("salida")}
                    className="flex items-center gap-3.5 rounded-lg border bg-card p-5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <ArrowUpFromLine className="h-5 w-5 text-foreground" />
                    </span>
                    <span>
                        <span className="block font-semibold">Quitar del stock</span>
                        <span className="block text-sm text-muted-foreground">Salida de materiales</span>
                    </span>
                </button>
            </div>

            <StockMovementDialog
                type="entrada"
                materials={materials}
                canSetUnitCost={false}
                open={dialog === "entrada"}
                onOpenChange={(open) => !open && setDialog(null)}
            />
            <StockMovementDialog
                type="salida"
                materials={materials}
                open={dialog === "salida"}
                onOpenChange={(open) => !open && setDialog(null)}
            />
        </>
    )
}
