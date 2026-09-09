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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Undo2 } from "lucide-react"
import { returnOrderMaterials } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { formatStock } from "@/lib/format"
import { recipeReturnQuantities } from "@/lib/returns"
import type { ConsumedMaterial, OrderItemRecipe } from "@/lib/orders"

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
    recipes = [],
    onDone,
    onCancel,
}: {
    orderId: number
    consumed: ConsumedMaterial[]
    /** Receta por unidad de cada producto: permite devolver por producto. */
    recipes?: OrderItemRecipe[]
    onDone: () => void
    onCancel?: () => void
}) {
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    const [itemId, setItemId] = useState<string>("")
    const [unidades, setUnidades] = useState<string>("")
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

    const productoElegido = recipes.find((r) => String(r.order_item_id) === itemId) ?? null
    const unidadesNum = parsear(unidades)
    const unidadesValidas =
        !Number.isNaN(unidadesNum) &&
        unidadesNum > 0 &&
        productoElegido !== null &&
        unidadesNum <= productoElegido.quantity

    // Llena las cantidades con la receta del producto. PISA lo que hubiera cargado
    // a mano: elegir un producto es empezar de nuevo desde su receta, y mezclarlo
    // con lo anterior daría un total que nadie pidió. Después se corrige fila por
    // fila, que es para lo que están los inputs.
    const cargarReceta = () => {
        if (!productoElegido || !unidadesValidas) return
        const sugerido = recipeReturnQuantities(
            productoElegido.lines,
            unidadesNum,
            consumed.map((c) => ({ material_id: c.material_id, label: c.label, consumed: c.consumed })),
        )
        setRows((rs) =>
            rs.map((r) => {
                const qty = sugerido.get(r.material_id)
                return { ...r, qty: qty === undefined || qty <= 0 ? "" : String(qty) }
            }),
        )
        const sinNada = [...sugerido.values()].every((v) => v <= 0)
        if (sugerido.size === 0 || sinNada) {
            toast.error("No hay nada para devolver de ese producto", {
                description: "Sus materiales no figuran entre lo que este pedido retiró del depósito.",
            })
        }
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
            {/* Devolver por producto: elegís cuántas unidades vuelven y la receta
                llena las cantidades. No manda nada por su cuenta —solo completa el
                formulario de abajo— porque al desarmar siempre hay algo que no
                vuelve, y eso se corrige acá antes de confirmar. */}
            {recipes.length > 0 && (
                <div className="space-y-2 rounded-md border p-3">
                    <Label className="text-base">Devolver la receta de un producto</Label>
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[200px] flex-1">
                            <Select value={itemId} onValueChange={setItemId}>
                                <SelectTrigger className="h-9 w-full text-base">
                                    <SelectValue placeholder="Elegí el producto">
                                        <span className="block truncate text-left">
                                            {productoElegido?.product}
                                        </span>
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {recipes.map((r) => (
                                        <SelectItem key={r.order_item_id} value={String(r.order_item_id)}>
                                            <span className="truncate">{r.product}</span>
                                            <span className="ml-2 shrink-0 text-sm text-muted-foreground">
                                                {formatStock(r.quantity)} en el pedido
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-24">
                            <Input
                                type="number"
                                min={0}
                                max={productoElegido?.quantity}
                                value={unidades}
                                placeholder="Unidades"
                                onChange={(e) => setUnidades(e.target.value)}
                                className="h-9 text-base"
                            />
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={cargarReceta}
                            disabled={!unidadesValidas}
                        >
                            <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                            Cargar receta
                        </Button>
                    </div>
                    {productoElegido && (
                        <p className="text-sm text-muted-foreground">
                            {unidades.trim() !== "" && !unidadesValidas
                                ? `El pedido tiene ${formatStock(productoElegido.quantity)} de este producto.`
                                : `Llena las cantidades de abajo con la receta. Podés corregirlas antes de confirmar: lo que se rompió al desarmar no vuelve.`}
                        </p>
                    )}
                </div>
            )}

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
