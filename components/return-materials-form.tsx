"use client"

// Cancelar el retiro de un pedido, por producto: el taller retiró el material de 3
// luminarias, al final no van, y vuelve al estante.
//
// La lista son los productos del pedido de los que YA se retiró material, y nada
// más. Las unidades se deducen de la receta contra los movimientos (ver
// withdrawnProducts): el retiro se registra por material, no por producto, así que
// no hay un número guardado que decir.
//
// Al confirmar se traduce a materiales y se manda por returnOrderMaterials, que es
// quien valida contra lo realmente retirado.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { returnOrderMaterials } from "@/lib/order-actions"
import { OperatorPicker, type OperarioElegido } from "@/components/operator-picker"
import { useToast } from "@/hooks/use-toast"
import { formatStock } from "@/lib/format"
import { planProductReturn, withdrawnProducts } from "@/lib/returns"
import type { ConsumedMaterial, OrderItemRecipe } from "@/lib/orders"

export function ReturnMaterialsForm({
    orderId,
    consumed,
    recipes = [],
    onDone,
    onCancel,
}: {
    orderId: number
    consumed: ConsumedMaterial[]
    recipes?: OrderItemRecipe[]
    onDone: () => void
    onCancel?: () => void
}) {
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)

    // Quién devuelve, con el mismo criterio que al retirar.
    const [operario, setOperario] = useState<OperarioElegido | null>(null)
    const [hayOperarios, setHayOperarios] = useState(false)
    const [operarioError, setOperarioError] = useState(false)
    const retirable = consumed.map((c) => ({
        material_id: c.material_id,
        label: c.label,
        consumed: c.consumed,
    }))
    const productos = withdrawnProducts(recipes, retirable)

    // Cuántas unidades de cada producto vuelven. Arranca vacío: quien devuelve sabe
    // cuántas trae en la mano, y precargar el total invita a devolver de más de un
    // enter.
    const [unidades, setUnidades] = useState<Record<number, string>>({})

    const parsear = (q: string) => {
        const n = Number(q)
        return Number.isFinite(n) ? n : NaN
    }

    const errorDe = (id: number, tope: number): string | null => {
        const texto = unidades[id] ?? ""
        if (texto.trim() === "") return null
        const n = parsear(texto)
        if (Number.isNaN(n) || n < 0) return "Cantidad inválida"
        if (n > tope) return `Se retiró para ${formatStock(tope)}`
        return null
    }

    const hayError = productos.some((p) => errorDe(p.order_item_id, p.units) !== null)
    const seleccion = productos
        .map((p) => ({ order_item_id: p.order_item_id, units: parsear(unidades[p.order_item_id] ?? "") }))
        .filter((s) => !Number.isNaN(s.units) && s.units > 0)

    async function devolver() {
        if (hayOperarios && !operario) {
            setOperarioError(true)
            toast.error("Falta el operario", { description: "Tocá quién está devolviendo el material." })
            return
        }
        const items = planProductReturn(recipes, seleccion, retirable)
        if (items.length === 0) {
            toast.error("No hay nada para devolver", {
                description: "Los materiales de esos productos no figuran entre lo que este pedido retiró.",
            })
            return
        }

        setSaving(true)
        const result = await returnOrderMaterials(orderId, items, operario?.id ?? null)
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

    if (productos.length === 0) {
        return (
            <p className="text-base text-muted-foreground">
                Este pedido todavía no retiró material de ningún producto.
            </p>
        )
    }

    return (
        <>
            <div className="mb-4">
                <OperatorPicker
                    value={operario}
                    onChange={(op) => {
                        setOperario(op)
                        if (op) setOperarioError(false)
                    }}
                    onListLoaded={(cantidad) => setHayOperarios(cantidad > 0)}
                    error={operarioError}
                    disabled={saving}
                />
            </div>

            <div className="max-h-[60vh] space-y-2.5 overflow-y-auto pr-1">
                {productos.map((p) => {
                    const error = errorDe(p.order_item_id, p.units)
                    return (
                        <div key={p.order_item_id} className="flex items-start gap-3">
                            <div className="w-20 shrink-0">
                                <Input
                                    type="number"
                                    min={0}
                                    max={p.units}
                                    value={unidades[p.order_item_id] ?? ""}
                                    placeholder="0"
                                    onChange={(e) =>
                                        setUnidades((u) => ({ ...u, [p.order_item_id]: e.target.value }))
                                    }
                                    className={`h-9 text-base ${error ? "border-destructive" : ""}`}
                                />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="truncate text-base">{p.product}</div>
                                {error && <div className="text-sm text-destructive">{error}</div>}
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                                <span className="whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
                                    {formatStock(p.units)} retirad{p.units === 1 ? "a" : "as"}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() =>
                                        setUnidades((u) => ({ ...u, [p.order_item_id]: String(p.units) }))
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
                <Button onClick={devolver} disabled={saving || hayError || seleccion.length === 0}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Devolver al inventario
                </Button>
            </div>
        </>
    )
}
