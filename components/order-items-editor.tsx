"use client"

// "Qué armar" editable. Una línea por producto; se toca la cantidad o las specs
// y se guarda solo. Cambiar la cantidad REESCALA el BOM ya congelado (mantiene
// el por-unidad del pedido), no vuelve a leer la receta, que pudo cambiar.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { addOrderItem, deleteOrderItem, updateOrderItem } from "@/lib/order-actions"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ProductPicker } from "@/components/product-picker"
import type { SpecField } from "@/lib/orders"

interface Item {
    id: number
    product: string
    quantity: number
    specs: Record<string, string>
    needs_review: boolean
}

const SIN = "__ninguna__"

export function OrderItemsEditor({
    orderId,
    items,
    vocab,
    products,
}: {
    orderId: number
    items: Item[]
    vocab: Record<string, SpecField>
    products: string[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [editing, setEditing] = useState<number | null>(null)
    const [pendingDelete, setPendingDelete] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [adding, setAdding] = useState(false)

    async function run(fn: () => Promise<{ error?: string }>, ok: string) {
        const result = await fn()
        if (result.error) {
            toast.error("No se pudo guardar", { description: result.error })
            return false
        }
        toast.success(ok)
        router.refresh()
        return true
    }

    // Specs de corrido, solo los valores, en el orden del vocabulario.
    const specsLine = (specs: Record<string, string>) =>
        Object.keys(vocab)
            .filter((k) => specs[k])
            .map((k) => specs[k])
            .join(" · ")

    const faltantes = (specs: Record<string, string>) =>
        Object.entries(vocab).filter(([k, f]) => !f.free_text && !specs[k])

    return (
        <>
            <div className="border rounded-lg divide-y">
                {items.map((item) => {
                    const abierto = editing === item.id
                    const faltan = faltantes(item.specs)

                    if (!abierto) {
                        return (
                            <div
                                key={item.id}
                                className="group flex items-baseline gap-3 px-4 py-2.5 min-w-0 hover:bg-muted/40 cursor-pointer"
                                onClick={() => setEditing(item.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === "Enter" && setEditing(item.id)}
                            >
                                <span className="text-xl font-semibold tabular-nums w-10 shrink-0">
                                    {item.quantity}
                                </span>
                                <span className="text-[15px] font-medium shrink-0">{item.product}</span>
                                {specsLine(item.specs) && (
                                    <span className="text-[14px] text-muted-foreground truncate">
                                        {specsLine(item.specs)}
                                    </span>
                                )}
                                {faltan.length > 0 && (
                                    <span className="text-[12px] text-muted-foreground ml-auto shrink-0 border border-dashed rounded px-1.5 py-0.5">
                                        falta{faltan.length > 1 ? "n" : ""}{" "}
                                        {faltan.map(([, f]) => f.label.toLowerCase()).join(", ")}
                                    </span>
                                )}
                                <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto shrink-0 no-print">
                                    editar
                                </span>
                            </div>
                        )
                    }

                    return (
                        <div key={item.id} className="px-4 py-3 space-y-3 bg-muted/30">
                            <div className="flex items-center gap-3">
                                <Input
                                    type="number"
                                    min={1}
                                    defaultValue={item.quantity}
                                    className="h-8 w-20 text-[14px]"
                                    onBlur={(e) => {
                                        const q = Number(e.target.value)
                                        if (q !== item.quantity) {
                                            run(() => updateOrderItem(item.id, { quantity: q }), "Cantidad actualizada")
                                        }
                                    }}
                                />
                                <span className="text-[15px] font-medium flex-1 min-w-0 truncate">
                                    {item.product}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setPendingDelete(item.id)}
                                    title="Quitar del pedido"
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setEditing(null)}
                                    title="Listo"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                                {Object.entries(vocab).map(([key, field]) =>
                                    field.free_text ? (
                                        <Input
                                            key={key}
                                            defaultValue={item.specs[key] ?? ""}
                                            placeholder={field.label}
                                            className="h-8 text-[13px]"
                                            onBlur={(e) => {
                                                const next = { ...item.specs }
                                                if (e.target.value) next[key] = e.target.value
                                                else delete next[key]
                                                if ((item.specs[key] ?? "") !== e.target.value) {
                                                    run(() => updateOrderItem(item.id, { specs: next }), "Actualizado")
                                                }
                                            }}
                                        />
                                    ) : (
                                        <Select
                                            key={key}
                                            value={item.specs[key] ?? SIN}
                                            onValueChange={(v) => {
                                                const next = { ...item.specs }
                                                if (v === SIN) delete next[key]
                                                else next[key] = v
                                                run(() => updateOrderItem(item.id, { specs: next }), "Actualizado")
                                            }}
                                        >
                                            <SelectTrigger className="h-8 text-[13px]">
                                                <SelectValue placeholder={field.label} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={SIN}>{field.label}: sin especificar</SelectItem>
                                                {field.options.map((o) => (
                                                    <SelectItem key={o} value={o}>
                                                        {field.label}: {o}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ),
                                )}
                            </div>
                        </div>
                    )
                })}

                {adding && (
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                        <span className="text-[13px] text-muted-foreground shrink-0">Agregar</span>
                        <ProductPicker
                            products={products}
                            onCancel={() => setAdding(false)}
                            onPick={async (product) => {
                                setAdding(false)
                                // Entra con cantidad 1; se ajusta tocando la línea,
                                // igual que las specs. Un campo, no un formulario.
                                await run(
                                    () => addOrderItem(orderId, { product, quantity: 1 }),
                                    `${product} agregado`,
                                )
                            }}
                        />
                    </div>
                )}
            </div>

            {!adding && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-muted-foreground no-print"
                    onClick={() => setAdding(true)}
                >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Agregar producto
                </Button>
            )}

            <ConfirmDialog
                open={pendingDelete !== null}
                onOpenChange={(open) => !open && setPendingDelete(null)}
                title="Quitar del pedido"
                description="Se borra la línea y sus materiales. No se puede deshacer."
                confirmLabel="Quitar"
                destructive
                loading={deleting}
                onConfirm={async () => {
                    if (pendingDelete == null) return
                    setDeleting(true)
                    await run(() => deleteOrderItem(pendingDelete), "Producto quitado")
                    setDeleting(false)
                    setPendingDelete(null)
                    setEditing(null)
                }}
            />
        </>
    )
}
