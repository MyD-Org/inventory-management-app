"use client"

// "Qué armar" editable. Una línea por producto; se toca la cantidad o las specs
// y se guarda solo. Cambiar la cantidad REESCALA el BOM ya congelado (mantiene
// el por-unidad del pedido), no vuelve a leer la receta, que pudo cambiar.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Loader2, Plus, Trash2 } from "lucide-react"
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
    // Borrador: lo que se toca queda acá hasta apretar Guardar. Antes cada
    // cambio pegaba solo contra el server y no se entendía qué había pasado.
    const [draft, setDraft] = useState<{ quantity: number; specs: Record<string, string> } | null>(null)
    const [savingLine, setSavingLine] = useState(false)

    function abrir(item: Item) {
        setEditing(item.id)
        setDraft({ quantity: item.quantity, specs: { ...item.specs } })
    }

    function cerrar() {
        setEditing(null)
        setDraft(null)
    }
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

    // Una columna por campo del vocabulario, en su orden. Las celdas vacías
    // muestran solo qué falta especificar, sin necesidad de un cartel aparte.
    const columnas = Object.entries(vocab)

    // Specs de corrido, solo los valores, en el orden del vocabulario.
    const specsLine = (specs: Record<string, string>) =>
        Object.keys(vocab)
            .filter((k) => specs[k])
            .map((k) => vocab[k].labels[specs[k]] ?? specs[k])
            .join(" · ")

    const faltantes = (specs: Record<string, string>) =>
        Object.entries(vocab).filter(([k, f]) => !f.free_text && !specs[k])

    return (
        <>
            <div className="border rounded-lg overflow-x-auto scrollbar-hide">
                <table className="w-full">
                    <thead>
                        <tr className="text-left">
                            <th className="px-3 py-2 text-[11px] font-medium text-muted-foreground text-right w-16">
                                Cant.
                            </th>
                            <th className="px-3 py-2 text-[11px] font-medium text-muted-foreground">
                                Producto
                            </th>
                            {columnas.map(([key, field]) => (
                                <th
                                    key={key}
                                    className="px-3 py-2 text-[11px] font-medium text-muted-foreground whitespace-nowrap"
                                >
                                    {field.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                {items.map((item) => {
                    const abierto = editing === item.id
                    const faltan = faltantes(item.specs)

                    if (!abierto) {
                        return (
                            <tr
                                key={item.id}
                                onClick={() => abrir(item)}
                                tabIndex={0}
                                onKeyDown={(e) => e.key === "Enter" && abrir(item)}
                                className="border-t hover:bg-muted/40 cursor-pointer outline-none focus-visible:bg-muted/40"
                            >
                                <td className="px-3 py-2 text-right align-middle">
                                    <span className="text-[17px] font-semibold tabular-nums">
                                        {item.quantity}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-[14px] font-medium">
                                    <span className="block max-w-[180px] truncate" title={item.product}>
                                        {item.product}
                                    </span>
                                </td>
                                {columnas.map(([key, field]) => {
                                    const v = item.specs[key]
                                    return (
                                        <td
                                            key={key}
                                            className={`px-3 py-2 text-[13px] ${
                                                v ? "" : "text-muted-foreground/40"
                                            }`}
                                            title={v ? v : `${field.label} sin especificar`}
                                        >
                                            {/* El texto libre puede ser largo: se corta con
                                                puntos suspensivos para que la tabla no crezca
                                                a lo ancho. El texto completo va en el title y
                                                se ve entero al abrir la fila. */}
                                            <span
                                                className={`block truncate ${
                                                    field.free_text ? "max-w-[180px]" : "max-w-[120px]"
                                                }`}
                                            >
                                                {v ? field.labels[v] ?? v : "—"}
                                            </span>
                                        </td>
                                    )
                                })}
                            </tr>
                        )
                    }

                    const sucio =
                        draft !== null &&
                        (draft.quantity !== item.quantity ||
                            JSON.stringify(draft.specs) !== JSON.stringify(item.specs))

                    return (
                        <tr key={item.id} className="border-t bg-muted/30">
                          <td colSpan={2 + columnas.length} className="px-4 py-3 space-y-3">
                            <div className="flex items-center gap-3">
                                <Input
                                    type="number"
                                    min={1}
                                    value={draft?.quantity ?? item.quantity}
                                    className="h-8 w-20 text-[14px]"
                                    onChange={(e) =>
                                        setDraft((d) => (d ? { ...d, quantity: Number(e.target.value) } : d))
                                    }
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
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                                {Object.entries(vocab).map(([key, field]) =>
                                    field.free_text ? (
                                        <Input
                                            key={key}
                                            value={draft?.specs[key] ?? ""}
                                            placeholder={field.label}
                                            className="h-8 text-[13px]"
                                            onChange={(e) =>
                                                setDraft((d) => {
                                                    if (!d) return d
                                                    const specs = { ...d.specs }
                                                    if (e.target.value) specs[key] = e.target.value
                                                    else delete specs[key]
                                                    return { ...d, specs }
                                                })
                                            }
                                        />
                                    ) : (
                                        <Select
                                            key={key}
                                            value={draft?.specs[key] ?? SIN}
                                            onValueChange={(v) =>
                                                setDraft((d) => {
                                                    if (!d) return d
                                                    const specs = { ...d.specs }
                                                    if (v === SIN) delete specs[key]
                                                    else specs[key] = v
                                                    return { ...d, specs }
                                                })
                                            }
                                        >
                                            {/* La etiqueta del campo va acá una vez; las opciones
                                                muestran solo el valor, sin repetirla. */}
                                            <SelectTrigger className="h-8 text-[13px]">
                                                <span className="truncate">
                                                    <span className="text-muted-foreground">{field.label}</span>
                                                    {draft?.specs[key] && (
                                                        <>: {field.labels[draft.specs[key]] ?? draft.specs[key]}</>
                                                    )}
                                                </span>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={SIN} className="text-muted-foreground">
                                                    Sin especificar
                                                </SelectItem>
                                                {field.options.map((o) => (
                                                    <SelectItem key={o} value={o}>
                                                        {field.labels[o] ?? o}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ),
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={cerrar} disabled={savingLine}>
                                    Cancelar
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={!sucio || savingLine}
                                    onClick={async () => {
                                        if (!draft) return
                                        setSavingLine(true)
                                        const ok = await run(
                                            () =>
                                                updateOrderItem(item.id, {
                                                    quantity: draft.quantity,
                                                    specs: draft.specs,
                                                }),
                                            "Cambios guardados",
                                        )
                                        setSavingLine(false)
                                        if (ok) cerrar()
                                    }}
                                >
                                    {savingLine && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                    Guardar
                                </Button>
                            </div>
                          </td>
                        </tr>
                    )
                })}

                {adding && (
                    <tr className="border-t bg-muted/30">
                      <td colSpan={2 + columnas.length} className="px-4 py-3">
                       <div className="flex items-center gap-3">
                        <span className="text-[13px] text-muted-foreground shrink-0">Agregar</span>
                        <ProductPicker
                            products={products}
                            autoFocus
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
                      </td>
                    </tr>
                )}
                    </tbody>
                </table>
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
                    cerrar()
                }}
            />
        </>
    )
}
