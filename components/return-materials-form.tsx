"use client"

// Devolver al depósito material que se retiró por un pedido: el taller sacó 3
// placas, al final no van, y vuelven al estante.
//
// La lista NO sale del BOM sino de los movimientos: lo que se puede devolver es
// lo que realmente se retiró, aunque no estuviera en la lista de materiales (un
// extra, una alternativa de familia) y aunque se haya retirado de más. El tope de
// cada fila es lo neto que este pedido tiene afuera: devolver más que eso sería
// meter al inventario material que vino de otro lado, o sea un ajuste, no una
// devolución.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { returnOrderMaterials } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { formatStock } from "@/lib/format"
import type { ConsumedMaterial } from "@/lib/orders"

interface Row {
    material_id: number
    label: string
    barcode: string
    unit: string | null
    consumed: number
    qty: string
}

export function ReturnMaterialsForm({
    orderId,
    consumed,
    onDone,
    onCancel,
}: {
    orderId: number
    consumed: ConsumedMaterial[]
    onDone: () => void
    onCancel?: () => void
}) {
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    // Arranca en cero y no en "todo": devolver es la excepción, y quien entra acá
    // sabe cuántas trae en la mano. Sugerir el total invita a devolver de más de
    // un enter.
    const [rows, setRows] = useState<Row[]>(() =>
        consumed.map((c) => ({
            material_id: c.material_id,
            label: c.label,
            barcode: c.barcode,
            unit: c.unit,
            consumed: c.consumed,
            qty: "",
        })),
    )

    const parsear = (q: string) => {
        const n = Number(q)
        return Number.isFinite(n) ? n : NaN
    }

    const errorDe = (r: Row): string | null => {
        if (r.qty.trim() === "") return null
        const n = parsear(r.qty)
        if (Number.isNaN(n) || n < 0) return "Cantidad inválida"
        if (n > r.consumed) return `El pedido retiró ${formatStock(r.consumed)}`
        return null
    }

    const hayError = rows.some((r) => errorDe(r) !== null)
    const aDevolver = rows.filter((r) => {
        const n = parsear(r.qty)
        return !Number.isNaN(n) && n > 0
    })

    async function devolver() {
        setSaving(true)
        const result = await returnOrderMaterials(
            orderId,
            aDevolver.map((r) => ({ material_id: r.material_id, quantity: parsear(r.qty) })),
        )
        setSaving(false)
        if (result.error) {
            toast.error("No se pudo devolver", { description: result.error })
            return
        }
        toast.success(
            result.count === 1
                ? "1 material devuelto al inventario"
                : `${result.count} materiales devueltos al inventario`,
        )
        onDone()
    }

    if (rows.length === 0) {
        return (
            <p className="text-base text-muted-foreground">
                Este pedido todavía no retiró nada del inventario.
            </p>
        )
    }

    return (
        <>
            <div className="max-h-[60vh] space-y-2.5 overflow-y-auto pr-1">
                {rows.map((r, idx) => {
                    const error = errorDe(r)
                    return (
                        <div key={r.material_id} className="flex items-start gap-3">
                            <div className="w-20 shrink-0">
                                <Input
                                    type="number"
                                    min={0}
                                    max={r.consumed}
                                    value={r.qty}
                                    placeholder="0"
                                    onChange={(e) =>
                                        setRows((rs) =>
                                            rs.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)),
                                        )
                                    }
                                    className={`h-9 text-base ${error ? "border-destructive" : ""}`}
                                />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="truncate text-base">{r.label}</div>
                                {r.barcode && (
                                    <div className="truncate font-mono text-sm text-muted-foreground">
                                        {r.barcode}
                                    </div>
                                )}
                                {error && <div className="text-sm text-destructive">{error}</div>}
                            </div>

                            {/* Lo retirado es el tope de la fila, así que va al lado del
                                input: es el número contra el que se compara lo que se
                                escribe. El botón "Todo" evita tipear el total, que es el
                                caso de "no lo quieren, va todo de vuelta". */}
                            <div className="flex shrink-0 items-center gap-2">
                                <span className="whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
                                    {formatStock(r.consumed)} retirad{r.consumed === 1 ? "o" : "os"}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() =>
                                        setRows((rs) =>
                                            rs.map((x, i) =>
                                                i === idx ? { ...x, qty: String(x.consumed) } : x,
                                            ),
                                        )
                                    }
                                >
                                    Todo
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
                {onCancel && (
                    <Button variant="outline" onClick={onCancel} disabled={saving}>
                        Cancelar
                    </Button>
                )}
                <Button onClick={devolver} disabled={saving || hayError || aDevolver.length === 0}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Devolver al inventario
                </Button>
            </div>
        </>
    )
}
