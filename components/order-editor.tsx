"use client"

// Carga manual de un pedido. Los desplegables de specs salen del MISMO vocabulario
// que consume el bot, así una persona no puede cargar un valor que el bot no puede
// ofrecer (ni al revés).

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
import type { SpecField } from "@/lib/orders"

interface Line {
    product: string
    qty: number
    specs: Record<string, string>
}

const SIN_ESPECIFICAR = "__ninguna__"

export function OrderEditor({
    specs,
    products,
}: {
    specs: Record<string, SpecField>
    products: { name: string; salePrice: number }[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    const [externalId, setExternalId] = useState("")
    const [customerId, setCustomerId] = useState("")
    const [customerName, setCustomerName] = useState("")
    const [notes, setNotes] = useState("")
    const [lines, setLines] = useState<Line[]>([{ product: "", qty: 1, specs: {} }])

    function updateLine(idx: number, patch: Partial<Line>) {
        setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
    }

    function setSpec(idx: number, key: string, value: string) {
        setLines((ls) =>
            ls.map((l, i) => {
                if (i !== idx) return l
                const next = { ...l.specs }
                // "Sin especificar" saca la clave: no mandamos specs vacías.
                if (value === SIN_ESPECIFICAR) delete next[key]
                else next[key] = value
                return { ...l, specs: next }
            }),
        )
    }

    async function save() {
        setSaving(true)
        const result = await createOrderManual({
            external_id: externalId,
            customer_external_id: customerId,
            customer_name: customerName || null,
            notes: notes || null,
            items: lines.map((l) => ({ product: l.product, qty: l.qty, specs: l.specs })),
        })
        setSaving(false)

        if (result.error) {
            toast.error("No se pudo guardar", { description: result.error })
            return
        }
        if (result.created === false) {
            toast.warning?.("Ese pedido ya existía", {
                description: "El identificador ya estaba usado; te llevo al pedido original.",
            }) ?? toast.success("Ese pedido ya existía")
        } else {
            toast.success("Pedido creado")
        }
        router.push(`/pedidos/${result.id}`)
    }

    return (
        <div className="space-y-6">
            <div className="rounded-md border p-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="external_id">Identificador del pedido</Label>
                        <Input
                            id="external_id"
                            value={externalId}
                            onChange={(e) => setExternalId(e.target.value)}
                            placeholder="ej: MANUAL-0001"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Tiene que ser único. Si repetís uno existente se abre el pedido original en vez
                            de crear un duplicado.
                        </p>
                    </div>
                    <div>
                        <Label htmlFor="customer_id">ID del cliente</Label>
                        <Input
                            id="customer_id"
                            value={customerId}
                            onChange={(e) => setCustomerId(e.target.value)}
                            placeholder="ej: cli-77"
                        />
                    </div>
                    <div>
                        <Label htmlFor="customer_name">Nombre del cliente</Label>
                        <Input
                            id="customer_name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="opcional"
                        />
                    </div>
                </div>
                <div>
                    <Label htmlFor="notes">Notas</Label>
                    <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
                                        <SelectItem key={p.name} value={p.name}>
                                            {p.name}
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
                                value={line.qty}
                                onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {Object.entries(specs).map(([key, field]) => (
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
                        ))}
                    </div>
                </div>
            ))}

            <div className="flex justify-between">
                <Button
                    variant="outline"
                    onClick={() => setLines((ls) => [...ls, { product: "", qty: 1, specs: {} }])}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar línea
                </Button>
                <Button onClick={save} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear pedido
                </Button>
            </div>
        </div>
    )
}
