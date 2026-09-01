"use client"

// Alta de pedido con la MISMA pantalla que el detalle: la tabla "Qué armar" a
// la izquierda con una columna por spec, y las propiedades al costado. Se
// completa igual que se edita un pedido ya creado, en vez de en un modal
// apretado donde las specs entraban como pastillas amontonadas.
//
// A diferencia del detalle, acá nada se guarda hasta apretar "Crear pedido":
// no queremos pedidos a medio hacer ensuciando el tablero si alguien abandona.

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
import type { SpecField } from "@/lib/orders"

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

export function NewOrderPage({
    specs,
    products,
}: {
    specs: Record<string, SpecField>
    products: string[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [customer, setCustomer] = useState<PickedCustomer | null>(null)
    const [priority, setPriority] = useState("normal")
    const [eta, setEta] = useState("")
    const [notes, setNotes] = useState("")
    const [lines, setLines] = useState<Line[]>([])
    const [agregando, setAgregando] = useState(true)
    // Fila en blanco que se completa dentro de la tabla y se suma al confirmar.
    const [borrador, setBorrador] = useState<Line>({ product: "", quantity: 1, specs: {} })
    const [saving, setSaving] = useState(false)

    const columnas = Object.entries(specs)
    // Anchos: solo se fijan los extremos (cantidad, producto y acciones). Las
    // columnas de specs NO llevan ancho y se reparten lo que sobra.
    //
    // Antes tenían 13% cada una y con el vocabulario actual la suma daba 101%:
    // la tabla quedaba más ancha que su recuadro y el botón de la última columna
    // se desbordaba. Con porcentajes fijos, agregar un campo de spec volvía a
    // romperlo; repartiendo el resto, entra siempre.
    const anchoCol = (kind: string) => (kind === "boolean" ? "w-[80px]" : "")


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

    return (
        <div className="w-full px-8 py-6">
            <div className="flex items-center gap-1.5 text-base text-muted-foreground mb-5">
                <Link href="/pedidos" className="hover:text-foreground">
                    Pedidos
                </Link>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                <span className="text-foreground">Nuevo</span>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_250px] items-start">
                {/* ---------- Qué armar ---------- */}
                <div className="min-w-0 space-y-7">
                    <section>

                        <div className="border rounded-lg">
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
                                                    field.kind,
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
                                                    value={line.quantity}
                                                    className="h-9 w-full text-base px-2"
                                                    onChange={(e) =>
                                                        setLines((ls) =>
                                                            ls.map((l, i) =>
                                                                i === idx
                                                                    ? { ...l, quantity: Number(e.target.value) }
                                                                    : l,
                                                            ),
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-base font-medium">
                                                <span className="block truncate" title={line.product}>
                                                    {line.product}
                                                </span>
                                            </td>

                                            {columnas.map(([key, field]) => (
                                                <td key={key} className="px-3 py-2">
                                                    {field.kind === "boolean" ? (
                                                        <label className="flex items-center h-9 cursor-pointer select-none">
                                                            <input
                                                                type="checkbox"
                                                                className="h-4 w-4 accent-primary"
                                                                checked={line.specs[key] === "con"}
                                                                onChange={(e) =>
                                                                    setSpec(idx, key, e.target.checked ? "con" : null)
                                                                }
                                                            />
                                                        </label>
                                                    ) : field.kind === "text" ? (
                                                        <Input
                                                            value={line.specs[key] ?? ""}
                                                            placeholder="—"
                                                            className="h-9 text-base w-full px-2"
                                                            onChange={(e) => setSpec(idx, key, e.target.value)}
                                                        />
                                                    ) : (
                                                        <Select
                                                            value={line.specs[key] ?? SIN}
                                                            onValueChange={(v) => setSpec(idx, key, v)}
                                                        >
                                                            <SelectTrigger className="h-9 text-base w-full px-2">
                                                                <span className="truncate">
                                                                    {line.specs[key] ? (
                                                                        field.labels[line.specs[key]] ??
                                                                        line.specs[key]
                                                                    ) : (
                                                                        <span className="text-muted-foreground/60">
                                                                            —
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem
                                                                    value={SIN}
                                                                    className="text-muted-foreground"
                                                                >
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

                                            <td className="px-2 py-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-8 text-muted-foreground hover:text-destructive"
                                                    title="Quitar"
                                                    onClick={() =>
                                                        setLines((ls) => ls.filter((_, i) => i !== idx))
                                                    }
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
                                                    value={borrador.quantity}
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
                                                        onPick={(product) => {
                                                            // La fila se suma sola al elegir el
                                                            // producto: sin producto no hay línea y
                                                            // con producto ya es una, así que
                                                            // confirmarla a mano no decide nada.
                                                            //
                                                            // Además cerraba un agujero: crear()
                                                            // manda `lines`, y una fila a medio
                                                            // cargar en el borrador se perdía sin
                                                            // aviso al apretar "Crear pedido".
                                                            //
                                                            // La cantidad y las specs que se hayan
                                                            // tipeado antes de elegir el producto se
                                                            // llevan con la fila.
                                                            setLines((ls) => [...ls, { ...borrador, product }])
                                                            setBorrador({ product: "", quantity: 1, specs: {} })
                                                            setAgregando(false)
                                                        }}
                                                    />
                                                )}
                                            </td>

                                            {columnas.map(([key, field]) => (
                                                <td key={key} className="px-3 py-2">
                                                    {field.kind === "boolean" ? (
                                                        <label className="flex items-center h-9 cursor-pointer select-none">
                                                            <input
                                                                type="checkbox"
                                                                className="h-4 w-4 accent-primary"
                                                                checked={borrador.specs[key] === "con"}
                                                                onChange={(e) =>
                                                                    setBorrador((b) => {
                                                                        const specs = { ...b.specs }
                                                                        if (e.target.checked) specs[key] = "con"
                                                                        else delete specs[key]
                                                                        return { ...b, specs }
                                                                    })
                                                                }
                                                            />
                                                        </label>
                                                    ) : field.kind === "text" ? (
                                                        <Input
                                                            value={borrador.specs[key] ?? ""}
                                                            placeholder="—"
                                                            className="h-9 text-base w-full px-2"
                                                            onChange={(e) =>
                                                                setBorrador((b) => {
                                                                    const specs = { ...b.specs }
                                                                    if (e.target.value)
                                                                        specs[key] = e.target.value
                                                                    else delete specs[key]
                                                                    return { ...b, specs }
                                                                })
                                                            }
                                                        />
                                                    ) : (
                                                        <Select
                                                            value={borrador.specs[key] ?? SIN}
                                                            onValueChange={(v) =>
                                                                setBorrador((b) => {
                                                                    const specs = { ...b.specs }
                                                                    if (v === SIN) delete specs[key]
                                                                    else specs[key] = v
                                                                    return { ...b, specs }
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="h-9 text-base w-full px-2">
                                                                <span className="truncate">
                                                                    {borrador.specs[key] ? (
                                                                        field.labels[borrador.specs[key]] ??
                                                                        borrador.specs[key]
                                                                    ) : (
                                                                        <span className="text-muted-foreground/60">
                                                                            —
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem
                                                                    value={SIN}
                                                                    className="text-muted-foreground"
                                                                >
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

                    <div className="flex items-center gap-2">
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
                <aside className="lg:border-l lg:pl-5 lg:sticky lg:top-4 space-y-3">
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
