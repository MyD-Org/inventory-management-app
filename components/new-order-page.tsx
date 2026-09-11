"use client"

// Alta de pedido con la MISMA pantalla que el detalle: la tabla "Qué armar" a
// la izquierda con una columna por spec, y las propiedades al costado. Se
// completa igual que se edita un pedido ya creado, en vez de en un modal
// apretado donde las specs entraban como pastillas amontonadas.
//
// A diferencia del detalle, acá nada se guarda hasta apretar "Crear pedido":
// no queremos pedidos a medio hacer ensuciando el tablero si alguien abandona.
//
// En pantalla angosta la tabla no va: con table-fixed, cada spec nueva le
// roba ancho a las demás y en un teléfono terminan siendo columnas de dos
// letras. De lg para abajo cada línea es una TARJETA con las specs una debajo
// de la otra y su etiqueta al lado, que es lo mismo que muestra la tabla
// puesto en vertical.

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { ChevronRight, Loader2, Plus, Trash2 } from "lucide-react"
import { createOrderManual } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { CustomerPicker, type PickedCustomer } from "@/components/customer-picker"
import { ProductPicker } from "@/components/product-picker"
import { PriorityIcon } from "@/components/order-glyphs"
import type { SpecField, SellableProduct } from "@/lib/orders"

interface Line {
    product: string
    quantity: number
    specs: Record<string, string>
}

const SIN = "__ninguna__"
const PRIORITY_LABELS: Record<string, string> = { baja: "Baja", normal: "Normal", alta: "Alta" }

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[86px_1fr] items-center gap-2 py-1">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className="text-base min-w-0">{children}</div>
        </div>
    )
}

// El control de UNA spec, sea celda de la tabla o fila de la tarjeta. Estaba
// escrito cuatro veces (fila x borrador, y ahora tabla x tarjeta): la lógica de
// qué pinta cada kind vive acá y sola.
function SpecControl({
    field,
    value,
    onChange,
}: {
    field: SpecField
    value: string | undefined
    onChange: (value: string | null) => void
}) {
    if (field.kind === "boolean") {
        return (
            <label className="flex h-9 items-center cursor-pointer select-none">
                <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={value === "con"}
                    onChange={(e) => onChange(e.target.checked ? "con" : null)}
                />
            </label>
        )
    }

    if (field.kind === "text") {
        return (
            <Input
                value={value ?? ""}
                placeholder="—"
                className="h-9 w-full px-2 text-base"
                onChange={(e) => onChange(e.target.value || null)}
            />
        )
    }

    return (
        <Select value={value ?? SIN} onValueChange={(v) => onChange(v === SIN ? null : v)}>
            <SelectTrigger className="h-9 w-full gap-1 px-1.5 text-base">
                <span className="min-w-0 flex-1 truncate">
                    {value ? (
                        field.labels[value] ?? value
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
    )
}

export function NewOrderPage({
    specs,
    products,
}: {
    specs: Record<string, SpecField>
    products: SellableProduct[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [customer, setCustomer] = useState<PickedCustomer | null>(null)
    const [priority, setPriority] = useState("normal")
    const [eta, setEta] = useState("")
    const [notes, setNotes] = useState("")
    const [reference, setReference] = useState("")
    const [lines, setLines] = useState<Line[]>([])
    const [agregando, setAgregando] = useState(true)
    // Fila en blanco que se completa dentro de la tabla y se suma al confirmar.
    const [borrador, setBorrador] = useState<Line>({ product: "", quantity: 1, specs: {} })
    const [saving, setSaving] = useState(false)

    const columnas = Object.entries(specs)
    // Anchos por campo, no por tipo: la óptica es un número corto ("30°") y la
    // grampa una palabra; no necesitan lo mismo que el color del equipo o las
    // indicaciones, que se leen enteros. Lo que no tiene ancho fijo se reparte
    // lo que sobra entre el resto de las columnas de specs. Mismo criterio que
    // la tabla del detalle (order-items-editor).
    const ANCHO_POR_CAMPO: Record<string, string> = {
        optic: "w-[72px]",
        clamp: "w-[88px]",
        stake: "w-[80px]",
        body_color: "w-[22%]",
    }
    const anchoCol = (key: string) => ANCHO_POR_CAMPO[key] ?? ""

    function setSpec(idx: number, key: string, value: string | null) {
        setLines((ls) =>
            ls.map((l, i) => {
                if (i !== idx) return l
                const next = { ...l.specs }
                if (value === null || value === SIN || value === "") delete next[key]
                else next[key] = value
                return { ...l, specs: next }
            }),
        )
    }

    function setBorradorSpec(key: string, value: string | null) {
        setBorrador((b) => {
            const next = { ...b.specs }
            if (value === null || value === SIN || value === "") delete next[key]
            else next[key] = value
            return { ...b, specs: next }
        })
    }

    function setCantidad(idx: number, value: number) {
        setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, quantity: value } : l)))
    }

    function quitar(idx: number) {
        setLines((ls) => ls.filter((_, i) => i !== idx))
    }

    // Al elegir el producto la fila se suma sola: sin producto no hay línea y
    // con producto ya es una, así que confirmarla a mano no decide nada.
    //
    // Además cierra un agujero: crear() manda `lines`, y una fila a medio cargar
    // en el borrador se perdía sin aviso al apretar "Crear pedido".
    //
    // La cantidad y las specs tipeadas antes de elegir el producto se llevan
    // con la fila.
    function confirmarBorrador(product: string) {
        setLines((ls) => [...ls, { ...borrador, product }])
        setBorrador({ product: "", quantity: 1, specs: {} })
        setAgregando(false)
    }

    async function crear() {
        // Se valida al apretar y NO apagando el botón. Un botón deshabilitado no
        // dice qué le falta: hay que recorrer el formulario adivinando cuál de los
        // dos datos es el que lo tiene trabado. Acá se nombra el que falta.
        if (!customer) {
            toast.error("Falta el cliente", { description: "Elegí para quién es el pedido." })
            return
        }
        if (lines.length === 0) {
            toast.error("Falta el producto", { description: "Agregá al menos un producto al pedido." })
            return
        }

        setSaving(true)
        const result = await createOrderManual({
            external_id: "",
            origin: "manual",
            customer: {
                external_id: customer.external_id,
                name: customer.name,
                phone: customer.phone,
            },
            items: lines,
            delivery_date_estimate: eta || null,
            priority,
            reference: reference || null,
            notes: notes || null,
        })
        setSaving(false)
        if (result.error) {
            toast.error("No se pudo crear", { description: result.error })
            return
        }
        toast.success(result.created === false ? "Ese pedido ya existía" : "Pedido creado")
        router.push(`/pedidos/${result.id}`)
    }

    // Las specs de una línea, en vertical y con su etiqueta al lado. Es lo que
    // reemplaza a las columnas de la tabla en la tarjeta.
    function specsEnVertical(
        valores: Record<string, string>,
        onChange: (key: string, value: string | null) => void,
    ) {
        if (columnas.length === 0) return null
        return (
            <div className="space-y-1.5 border-t pt-2">
                {columnas.map(([key, field]) => (
                    <div key={key} className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-2">
                        {/* Sin truncate: en la tabla la etiqueta se corta porque
                            el ancho es de la columna, pero acá hay lugar para
                            que baje de línea y "Otras indicaciones" se lea entera. */}
                        <span className="text-sm leading-tight text-muted-foreground">{field.label}</span>
                        <SpecControl
                            field={field}
                            value={valores[key]}
                            onChange={(v) => onChange(key, v)}
                        />
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="w-full px-4 py-6 sm:px-8">
            <div className="flex items-center gap-1.5 text-base text-muted-foreground mb-5">
                <Link href="/pedidos" className="hover:text-foreground">
                    Pedidos
                </Link>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                <span className="text-foreground">Nuevo</span>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_250px] items-start">
                {/* ---------- Qué armar ---------- */}
                {/* En el teléfono va DESPUÉS del cliente (order-2): el pedido se
                    completa como se cuenta —para quién y recién después qué—, y
                    en escritorio la columna de la derecha lo deja igual. */}
                <div className="order-2 min-w-0 space-y-7 lg:order-none">
                    <section>
                        <div className="hidden rounded-lg border lg:block">
                            <table className="w-full table-fixed">
                                <thead>
                                    <tr className="text-left">
                                        <th className="px-3 py-2 text-sm font-medium text-muted-foreground text-right w-[72px]">
                                            Cant.
                                        </th>
                                        <th className="px-3 py-2 text-sm font-medium text-muted-foreground w-[18%]">
                                            Producto
                                        </th>
                                        {columnas.map(([key, field]) => (
                                            <th
                                                key={key}
                                                className={`px-3 py-2 text-sm font-medium text-muted-foreground ${anchoCol(
                                                    key,
                                                )}`}
                                            >
                                                <span className="block truncate">{field.label}</span>
                                            </th>
                                        ))}
                                        {/* Solo el tacho de quitar: la tabla es table-fixed
                                            y esta columna se ajusta al ancho de un icono. */}
                                        <th className="w-[44px]" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((line, idx) => (
                                        <tr key={idx} className="border-t">
                                            <td className="px-3 py-2">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={line.quantity || ""}
                                                    className="h-9 w-full text-base px-2"
                                                    onChange={(e) => setCantidad(idx, Number(e.target.value))}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-base font-medium">
                                                <span className="block truncate" title={line.product}>
                                                    {line.product}
                                                </span>
                                            </td>

                                            {columnas.map(([key, field]) => (
                                                <td key={key} className="px-3 py-2">
                                                    <SpecControl
                                                        field={field}
                                                        value={line.specs[key]}
                                                        onChange={(v) => setSpec(idx, key, v)}
                                                    />
                                                </td>
                                            ))}

                                            <td className="px-2 py-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-8 text-muted-foreground hover:text-destructive"
                                                    title="Quitar"
                                                    onClick={() => quitar(idx)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}

                                    {agregando && (
                                        <tr className="border-t bg-muted/30">
                                            <td className="px-3 py-2">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={borrador.quantity || ""}
                                                    className="h-9 w-full text-base px-2"
                                                    onChange={(e) =>
                                                        setBorrador((b) => ({
                                                            ...b,
                                                            quantity: Number(e.target.value),
                                                        }))
                                                    }
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                {borrador.product ? (
                                                    <button
                                                        type="button"
                                                        className="block w-full truncate text-left text-base font-medium hover:underline"
                                                        title="Cambiar producto"
                                                        onClick={() =>
                                                            setBorrador((b) => ({ ...b, product: "" }))
                                                        }
                                                    >
                                                        {borrador.product}
                                                    </button>
                                                ) : (
                                                    <ProductPicker
                                                        products={products}
                                                        autoFocus
                                                        onCancel={() =>
                                                            lines.length > 0 && setAgregando(false)
                                                        }
                                                        onPick={confirmarBorrador}
                                                    />
                                                )}
                                            </td>

                                            {columnas.map(([key, field]) => (
                                                <td key={key} className="px-3 py-2">
                                                    <SpecControl
                                                        field={field}
                                                        value={borrador.specs[key]}
                                                        onChange={(v) => setBorradorSpec(key, v)}
                                                    />
                                                </td>
                                            ))}

                                            <td className="px-2 py-2" />
                                        </tr>
                                    )}

                                    {lines.length === 0 && !agregando && (
                                        <tr className="border-t">
                                            <td
                                                colSpan={3 + columnas.length}
                                                className="px-3 py-6 text-center text-base text-muted-foreground"
                                            >
                                                Todavía no agregaste ningún producto.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* ---------- Lo mismo, en tarjetas, para el teléfono ---------- */}
                        <div className="space-y-3 lg:hidden">
                            {lines.map((line, idx) => (
                                <div key={idx} className="space-y-2 rounded-lg border p-3">
                                    <div className="flex items-start gap-2">
                                        <p className="min-w-0 flex-1 break-words text-base font-medium">
                                            {line.product}
                                        </p>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                            title="Quitar"
                                            onClick={() => quitar(idx)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-2">
                                        <span className="text-sm text-muted-foreground">Cantidad</span>
                                        <Input
                                            type="number"
                                            min={1}
                                            inputMode="numeric"
                                            value={line.quantity || ""}
                                            className="h-9 w-24 px-2 text-base"
                                            onChange={(e) => setCantidad(idx, Number(e.target.value))}
                                        />
                                    </div>

                                    {specsEnVertical(line.specs, (key, v) => setSpec(idx, key, v))}
                                </div>
                            ))}

                            {agregando && (
                                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                                    {borrador.product ? (
                                        <button
                                            type="button"
                                            className="block w-full break-words text-left text-base font-medium hover:underline"
                                            title="Cambiar producto"
                                            onClick={() => setBorrador((b) => ({ ...b, product: "" }))}
                                        >
                                            {borrador.product}
                                        </button>
                                    ) : (
                                        // Sin autoFocus en el teléfono: abrir el teclado solo
                                        // tapa media pantalla antes de que se vea qué es esto.
                                        <div className="flex">
                                            <ProductPicker
                                                products={products}
                                                onCancel={() => lines.length > 0 && setAgregando(false)}
                                                onPick={confirmarBorrador}
                                            />
                                        </div>
                                    )}

                                    <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-2">
                                        <span className="text-sm text-muted-foreground">Cantidad</span>
                                        <Input
                                            type="number"
                                            min={1}
                                            inputMode="numeric"
                                            value={borrador.quantity || ""}
                                            className="h-9 w-24 px-2 text-base"
                                            onChange={(e) =>
                                                setBorrador((b) => ({
                                                    ...b,
                                                    quantity: Number(e.target.value),
                                                }))
                                            }
                                        />
                                    </div>

                                    {specsEnVertical(borrador.specs, setBorradorSpec)}
                                </div>
                            )}

                            {lines.length === 0 && !agregando && (
                                <div className="rounded-lg border px-3 py-6 text-center text-base text-muted-foreground">
                                    Todavía no agregaste ningún producto.
                                </div>
                            )}
                        </div>

                        {!agregando && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 text-muted-foreground"
                                onClick={() => setAgregando(true)}
                            >
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Agregar producto
                            </Button>
                        )}
                    </section>

                    {/* Los dos botones a la derecha, también en el teléfono: es
                        donde cae el pulgar y donde termina de leerse el
                        formulario. Cancelar queda a la izquierda de Crear. */}
                    <div className="flex items-center justify-end gap-2">
                        <Link href="/pedidos">
                            <Button variant="ghost" size="sm" disabled={saving}>
                                Cancelar
                            </Button>
                        </Link>
                        <Button size="sm" onClick={crear} disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Crear pedido
                        </Button>
                    </div>
                </div>

                {/* ---------- Propiedades ---------- */}
                <aside className="order-1 space-y-3 lg:order-none lg:border-l lg:pl-5 lg:sticky lg:top-4">
                    <CustomerPicker value={customer} onChange={setCustomer} />

                    <Textarea
                        rows={2}
                        placeholder="Notas"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="text-base resize-none bg-muted/50 border-0 focus-visible:ring-1"
                    />

                    <div>
                        <Prop label="Prioridad">
                            <Select value={priority} onValueChange={setPriority}>
                                <SelectTrigger className="h-7 w-full border-0 bg-transparent px-1.5 text-base hover:bg-muted focus:ring-0 justify-start gap-2 -ml-1.5">
                                    <PriorityIcon priority={priority} />
                                    <span>{PRIORITY_LABELS[priority]}</span>
                                </SelectTrigger>
                                <SelectContent>
                                    {["baja", "normal", "alta"].map((p) => (
                                        <SelectItem key={p} value={p}>
                                            <span className="flex items-center gap-2">
                                                <PriorityIcon priority={p} />
                                                {PRIORITY_LABELS[p]}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Prop>

                        {/* Referencia: el código del otro lado (orden de compra,
                            expediente). Opcional; también se puede cargar después
                            desde el detalle. */}
                        <Prop label="Referencia">
                            <Input
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                placeholder="Sin referencia"
                                className="h-7 border-0 bg-transparent px-1.5 -ml-1.5 text-base hover:bg-muted focus-visible:ring-0 w-full"
                            />
                        </Prop>

                        <Prop label="Entrega">
                            <Input
                                type="date"
                                value={eta}
                                onChange={(e) => setEta(e.target.value)}
                                className="h-7 border-0 bg-transparent px-1.5 -ml-1.5 text-base hover:bg-muted focus-visible:ring-0 w-full"
                            />
                        </Prop>
                    </div>
                </aside>
            </div>
        </div>
    )
}
