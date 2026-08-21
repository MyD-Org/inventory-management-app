"use client"

// "Qué armar" editable. Una línea por producto; se toca la cantidad o las specs
// y se guarda solo. Cambiar la cantidad REESCALA el BOM ya congelado (mantiene
// el por-unidad del pedido), no vuelve a leer la receta, que pudo cambiar.

import { Fragment, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Check, Loader2, PackageX, Plus, Trash2 } from "lucide-react"
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
    // Fila nueva en blanco, se completa dentro de la tabla y se guarda entera.
    const [nuevo, setNuevo] = useState<{
        product: string
        quantity: number
        specs: Record<string, string>
    } | null>(null)
    const [addingSave, setAddingSave] = useState(false)

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

    // table-fixed + un ancho por columna: sin esto, al abrir una fila los
    // controles son más anchos que el texto y la tabla se estira, apareciendo
    // scroll horizontal y corriéndose todo. Con el ancho fijado, ver y editar
    // ocupan exactamente lo mismo.
    const anchoCol = (kind: string) =>
        kind === "boolean" ? "w-[72px]" : kind === "text" ? "w-[18%]" : "w-[12%]"

    // Specs de corrido, solo los valores, en el orden del vocabulario.
    const specsLine = (specs: Record<string, string>) =>
        Object.keys(vocab)
            .filter((k) => specs[k])
            .map((k) => vocab[k].labels[specs[k]] ?? specs[k])
            .join(" · ")

    const faltantes = (specs: Record<string, string>) =>
        Object.entries(vocab).filter(([k, f]) => f.kind === "list" && !specs[k])

    return (
        <>
            <div className="border rounded-lg">
                <table className="w-full table-fixed">
                    <thead>
                        <tr className="text-left">
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right w-[64px]">
                                Cant.
                            </th>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-[16%]">
                                Producto
                            </th>
                            {columnas.map(([key, field]) => (
                                <th
                                    key={key}
                                    className={`px-3 py-2 text-xs font-medium text-muted-foreground ${anchoCol(
                                        field.kind,
                                    )}`}
                                >
                                    <span className="block truncate" title={field.label}>
                                        {field.label}
                                    </span>
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
                                    <span className="text-lg font-semibold tabular-nums">
                                        {item.quantity}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-sm font-medium">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        <span className="truncate" title={item.product}>
                                            {item.product}
                                        </span>
                                        {/* Este producto no aporta materiales a la lista de
                                            abajo: hay que descontarlos a mano. Se marca acá,
                                            en la fila, que es donde se ve de cuál se trata. */}
                                        {item.needs_review && (
                                            <PackageX
                                                className="no-print h-3.5 w-3.5 shrink-0 text-destructive"
                                                aria-label="Sin lista de materiales"
                                            />
                                        )}
                                    </span>
                                </td>
                                {columnas.map(([key, field]) => {
                                    const v = item.specs[key]
                                    // Un boolean sin marcar no es un dato faltante:
                                    // es "sin". Siempre muestra una respuesta.
                                    if (field.kind === "boolean") {
                                        const con = v === "con"
                                        return (
                                            <td
                                                key={key}
                                                className="px-3 py-2"
                                                title={
                                                    con
                                                        ? field.labels["con"] ?? `Con ${field.label.toLowerCase()}`
                                                        : field.labels["sin"] ?? `Sin ${field.label.toLowerCase()}`
                                                }
                                            >
                                                {con && <Check className="h-4 w-4" />}
                                            </td>
                                        )
                                    }
                                    return (
                                        <td
                                            key={key}
                                            className={`px-3 py-2 text-sm ${
                                                v ? "" : "text-muted-foreground/40"
                                            }`}
                                            title={v ? v : `${field.label} sin especificar`}
                                        >
                                            {/* El texto libre puede ser largo: se corta con
                                                puntos suspensivos para que la tabla no crezca
                                                a lo ancho. El texto completo va en el title y
                                                se ve entero al abrir la fila. */}
                                            <span className="block truncate">
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
                        <Fragment key={item.id}>
                            {/* Se edita EN SU LUGAR: cada control en su columna, alineado
                                con el encabezado. Los selects muestran solo el valor,
                                porque el nombre del campo ya está en la cabecera. */}
                            <tr className="border-t bg-muted/30">
                                <td className="px-3 py-2 align-middle">
                                    <Input
                                        type="number"
                                        min={1}
                                        value={draft?.quantity ?? item.quantity}
                                        className="h-8 w-full text-sm px-2"
                                        onChange={(e) =>
                                            setDraft((d) => (d ? { ...d, quantity: Number(e.target.value) } : d))
                                        }
                                    />
                                </td>
                                <td className="px-3 py-2 text-sm font-medium">
                                    <span className="block truncate" title={item.product}>
                                        {item.product}
                                    </span>
                                </td>

                                {columnas.map(([key, field]) => (
                                    <td key={key} className="px-3 py-2">
                                        {field.kind === "boolean" ? (
                                            <label
                                                className="flex items-center h-8 cursor-pointer select-none"
                                                title={
                                                    field.labels["con"] ?? `Con ${field.label.toLowerCase()}`
                                                }
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 accent-primary"
                                                    checked={draft?.specs[key] === "con"}
                                                    onChange={(e) =>
                                                        setDraft((d) => {
                                                            if (!d) return d
                                                            const specs = { ...d.specs }
                                                            if (e.target.checked) specs[key] = "con"
                                                            else delete specs[key]
                                                            return { ...d, specs }
                                                        })
                                                    }
                                                />
                                            </label>
                                        ) : field.kind === "text" ? (
                                            <Input
                                                value={draft?.specs[key] ?? ""}
                                                placeholder="—"
                                                className="h-8 text-sm w-full px-2"
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
                                                <SelectTrigger className="h-8 text-sm w-full px-2">
                                                    <span className="truncate">
                                                        {draft?.specs[key]
                                                            ? field.labels[draft.specs[key]] ?? draft.specs[key]
                                                            : <span className="text-muted-foreground/60">—</span>}
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
                                        )}
                                    </td>
                                ))}
                            </tr>

                            <tr className="bg-muted/30">
                                <td colSpan={2 + columnas.length} className="px-3 pb-3">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => setPendingDelete(item.id)}
                                        >
                                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                            Quitar
                                        </Button>
                                        <div className="ml-auto flex items-center gap-2">
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
                                    </div>
                                </td>
                            </tr>
                        </Fragment>
                    )
                })}

                        {nuevo && (
                            <>
                                <tr className="border-t bg-muted/30">
                                    <td className="px-3 py-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={nuevo.quantity}
                                            className="h-8 w-full text-sm px-2"
                                            onChange={(e) =>
                                                setNuevo((n) =>
                                                    n ? { ...n, quantity: Number(e.target.value) } : n,
                                                )
                                            }
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        {nuevo.product ? (
                                            <button
                                                type="button"
                                                className="block w-full truncate text-left text-sm font-medium hover:underline"
                                                title="Cambiar producto"
                                                onClick={() => setNuevo((n) => (n ? { ...n, product: "" } : n))}
                                            >
                                                {nuevo.product}
                                            </button>
                                        ) : (
                                            <ProductPicker
                                                products={products}
                                                autoFocus
                                                onCancel={() => setNuevo(null)}
                                                onPick={(product) =>
                                                    setNuevo((n) => (n ? { ...n, product } : n))
                                                }
                                            />
                                        )}
                                    </td>

                                    {columnas.map(([key, field]) => (
                                        <td key={key} className="px-3 py-2">
                                            {field.kind === "boolean" ? (
                                                <label className="flex items-center h-8 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 accent-primary"
                                                        checked={nuevo.specs[key] === "con"}
                                                        onChange={(e) =>
                                                            setNuevo((n) => {
                                                                if (!n) return n
                                                                const specs = { ...n.specs }
                                                                if (e.target.checked) specs[key] = "con"
                                                                else delete specs[key]
                                                                return { ...n, specs }
                                                            })
                                                        }
                                                    />
                                                </label>
                                            ) : field.kind === "text" ? (
                                                <Input
                                                    value={nuevo.specs[key] ?? ""}
                                                    placeholder="—"
                                                    className="h-8 text-sm w-full px-2"
                                                    onChange={(e) =>
                                                        setNuevo((n) => {
                                                            if (!n) return n
                                                            const specs = { ...n.specs }
                                                            if (e.target.value) specs[key] = e.target.value
                                                            else delete specs[key]
                                                            return { ...n, specs }
                                                        })
                                                    }
                                                />
                                            ) : (
                                                <Select
                                                    value={nuevo.specs[key] ?? SIN}
                                                    onValueChange={(v) =>
                                                        setNuevo((n) => {
                                                            if (!n) return n
                                                            const specs = { ...n.specs }
                                                            if (v === SIN) delete specs[key]
                                                            else specs[key] = v
                                                            return { ...n, specs }
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger className="h-8 text-sm w-full px-2">
                                                        <span className="truncate">
                                                            {nuevo.specs[key] ? (
                                                                field.labels[nuevo.specs[key]] ?? nuevo.specs[key]
                                                            ) : (
                                                                <span className="text-muted-foreground/60">—</span>
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
                                            )}
                                        </td>
                                    ))}
                                </tr>

                                <tr className="bg-muted/30">
                                    <td colSpan={2 + columnas.length} className="px-3 pb-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setNuevo(null)}
                                                disabled={addingSave}
                                            >
                                                Cancelar
                                            </Button>
                                            <Button
                                                size="sm"
                                                disabled={!nuevo.product || nuevo.quantity <= 0 || addingSave}
                                                onClick={async () => {
                                                    setAddingSave(true)
                                                    const ok = await run(
                                                        () => addOrderItem(orderId, nuevo),
                                                        `${nuevo.product} agregado`,
                                                    )
                                                    setAddingSave(false)
                                                    if (ok) setNuevo(null)
                                                }}
                                            >
                                                {addingSave && (
                                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                                )}
                                                Agregar
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            </>
                        )}
                    </tbody>
                </table>
            </div>

            {/* El icono en la fila dice CUÁL; esta línea dice QUÉ significa, sin
                volver al cartel grande que ocupaba media pantalla. */}
            {items.some((i) => i.needs_review) && (
                <p className="no-print mt-2 flex items-start gap-1.5 text-xs text-destructive">
                    <PackageX className="h-3.5 w-3.5 shrink-0 mt-px" />
                    <span>
                        Los productos marcados no tienen cargada su lista de materiales, así que no
                        aparecen abajo. Hay que descontarlos de forma manual.
                    </span>
                </p>
            )}

            {!nuevo && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-muted-foreground no-print"
                    onClick={() => setNuevo({ product: "", quantity: 1, specs: {} })}
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
