"use client"

// Alta manual de un pedido. Los desplegables de specs salen del MISMO vocabulario
// que consume el bot, así una persona no puede cargar un valor que el bot no
// puede ofrecer (ni al revés). Sin precios: este módulo no maneja plata.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { createOrderManual } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { CustomerPicker, type PickedCustomer } from "@/components/customer-picker"
import type { SpecField } from "@/lib/orders"

interface Line {
    product: string
    quantity: number
    specs: Record<string, string>
}

const SIN_ESPECIFICAR = "__ninguna__"

export function OrderEditor({
    specs,
    products,
}: {
    specs: Record<string, SpecField>
    products: string[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    const [customer, setCustomer] = useState<PickedCustomer | null>(null)
    const [priority, setPriority] = useState("normal")
    const [eta, setEta] = useState("")
    const [notes, setNotes] = useState("")
    const [lines, setLines] = useState<Line[]>([{ product: "", quantity: 1, specs: {} }])

    function updateLine(idx: number, patch: Partial<Line>) {
        setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
    }

    function setSpec(idx: number, key: string, value: string) {
        setLines((ls) =>
            ls.map((l, i) => {
                if (i !== idx) return l
                const next = { ...l.specs }
                if (value === SIN_ESPECIFICAR || value === "") delete next[key]
                else next[key] = value
                return { ...l, specs: next }
            }),
        )
    }

    const listo = customer !== null && lines.every((l) => l.product && l.quantity > 0)

    async function save() {
        if (!listo) return
        setSaving(true)
        const result = await createOrderManual({
            // external_id lo genera el server: es para la idempotencia del bot,
            // no algo que una persona tenga que inventar.
            external_id: "",
            origin: "manual",
            customer: {
                external_id: customer?.external_id ?? "",
                name: customer?.name ?? null,
                phone: customer?.phone ?? null,
            },
            items: lines.map((l) => ({ product: l.product, quantity: l.quantity, specs: l.specs })),
            delivery_date_estimate: eta || null,
            priority,
            notes: notes || null,
        })
        setSaving(false)

        if (result.error) {
            toast.error("No se pudo guardar", { description: result.error })
            return
        }
        toast.success(
            result.created === false ? "Ese pedido ya existía, te llevo al original" : "Pedido creado",
        )
        router.push(`/pedidos/${result.id}`)
    }

    return (
        <div className="space-y-6">
            <div className="rounded-md border p-4 space-y-4">
                <CustomerPicker value={customer} onChange={setCustomer} />

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="eta">Entrega estimada</Label>
                        <Input
                            id="eta"
                            type="date"
                            className="mt-1.5"
                            value={eta}
                            onChange={(e) => setEta(e.target.value)}
                        />
                    </div>
                    <div>
                        <Label>Prioridad</Label>
                        <Select value={priority} onValueChange={setPriority}>
                            <SelectTrigger className="mt-1.5">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="baja">Baja</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="alta">Alta (urgente)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div>
                    <Label htmlFor="notes">Notas para el taller</Label>
                    <Textarea
                        id="notes"
                        className="mt-1.5"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                    />
                </div>
            </div>

            {lines.map((line, idx) => (
                <div key={idx} className="rounded-md border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium">Línea {idx + 1}</h3>
                        {lines.length > 1 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                            >
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                        <div>
                            <Label>Producto</Label>
                            <Select value={line.product} onValueChange={(v) => updateLine(idx, { product: v })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Elegí un producto costeado" />
                                </SelectTrigger>
                                <SelectContent>
                                    {products.map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {p}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {products.length === 0 && (
                                <p className="text-xs text-destructive mt-1">
                                    No hay productos costeados. Cargá uno en Calcular Costos primero.
                                </p>
                            )}
                        </div>
                        <div>
                            <Label htmlFor={`qty-${idx}`}>Cantidad</Label>
                            <Input
                                id={`qty-${idx}`}
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {Object.entries(specs).map(([key, field]) =>
                            field.free_text ? (
                                <div key={key} className="sm:col-span-2">
                                    <Label>{field.label}</Label>
                                    <Input
                                        value={line.specs[key] ?? ""}
                                        onChange={(e) => setSpec(idx, key, e.target.value)}
                                        placeholder="opcional"
                                    />
                                </div>
                            ) : (
                                <div key={key}>
                                    <Label>{field.label}</Label>
                                    <Select
                                        value={line.specs[key] ?? SIN_ESPECIFICAR}
                                        onValueChange={(v) => setSpec(idx, key, v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={SIN_ESPECIFICAR}>Sin especificar</SelectItem>
                                            {field.options.map((o) => (
                                                <SelectItem key={o} value={o}>
                                                    {o}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ),
                        )}
                    </div>
                </div>
            ))}

            <div className="flex justify-between">
                <Button
                    variant="outline"
                    onClick={() => setLines((ls) => [...ls, { product: "", quantity: 1, specs: {} }])}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar línea
                </Button>
                <Button onClick={save} disabled={saving || !listo}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear pedido
                </Button>
            </div>
        </div>
    )
}
