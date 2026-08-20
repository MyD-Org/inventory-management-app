"use client"

// Alta de pedido en un modal, como el "new issue" de Linear: no te saca de donde
// estás, arranca vacío y sin etiquetas gritando, y las propiedades opcionales son
// pastillas chicas abajo en vez de campos de formulario.

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { createOrderManual, getNewOrderOptions } from "@/lib/order-actions"
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

export function NewOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const router = useRouter()
    const { toast } = useToast()
    const [options, setOptions] = useState<{ specs: Record<string, SpecField>; products: string[] } | null>(null)
    const [customer, setCustomer] = useState<PickedCustomer | null>(null)
    const [lines, setLines] = useState<Line[]>([])
    const [adding, setAdding] = useState(true)
    const [priority, setPriority] = useState("normal")
    const [eta, setEta] = useState("")
    const [notes, setNotes] = useState("")
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!open) return
        getNewOrderOptions().then((o) => setOptions(o as any))
    }, [open])

    // Cada apertura arranca limpia.
    useEffect(() => {
        if (open) return
        setCustomer(null)
        setLines([])
        setAdding(true)
        setPriority("normal")
        setEta("")
        setNotes("")
    }, [open])

    const listo = customer !== null && lines.length > 0

    async function crear() {
        if (!listo) return
        setSaving(true)
        const result = await createOrderManual({
            external_id: "",
            origin: "manual",
            customer: {
                external_id: customer!.external_id,
                name: customer!.name,
                phone: customer!.phone,
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
        onOpenChange(false)
        router.push(`/pedidos/${result.id}`)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-0 gap-0">
                <DialogTitle className="sr-only">Nuevo pedido</DialogTitle>

                <div className="p-4 space-y-3">
                    <CustomerPicker value={customer} onChange={setCustomer} />

                    {lines.length > 0 && (
                        <div className="border rounded-md divide-y">
                            {lines.map((line, idx) => (
                                <div key={idx} className="px-3 py-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={line.quantity}
                                            onChange={(e) =>
                                                setLines((ls) =>
                                                    ls.map((l, i) =>
                                                        i === idx ? { ...l, quantity: Number(e.target.value) } : l,
                                                    ),
                                                )
                                            }
                                            className="h-7 w-16 text-[13px]"
                                        />
                                        <span className="text-[14px] font-medium flex-1 min-w-0 truncate">
                                            {line.product}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                                        >
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    </div>

                                    <div className="flex gap-1.5 flex-wrap">
                                        {Object.entries(options?.specs ?? {})
                                            .filter(([, f]) => !f.free_text)
                                            .map(([key, field]) => (
                                                <Select
                                                    key={key}
                                                    value={line.specs[key] ?? SIN}
                                                    onValueChange={(v) =>
                                                        setLines((ls) =>
                                                            ls.map((l, i) => {
                                                                if (i !== idx) return l
                                                                const next = { ...l.specs }
                                                                if (v === SIN) delete next[key]
                                                                else next[key] = v
                                                                return { ...l, specs: next }
                                                            }),
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger className="h-6 w-auto gap-1.5 rounded-full border px-2 text-[11px] focus:ring-0">
                                                        {line.specs[key] ?? field.label}
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
                                            ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {adding ? (
                        <div className="flex items-center gap-2">
                            <ProductPicker
                                products={options?.products ?? []}
                                onCancel={() => lines.length > 0 && setAdding(false)}
                                onPick={(product) => {
                                    setLines((ls) => [...ls, { product, quantity: 1, specs: {} }])
                                    setAdding(false)
                                }}
                            />
                        </div>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground -ml-2"
                            onClick={() => setAdding(true)}
                        >
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Agregar producto
                        </Button>
                    )}

                    <Textarea
                        rows={2}
                        placeholder="Notas para el taller (opcional)"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="text-[13px] resize-none border-0 bg-muted/40 focus-visible:ring-1 px-2"
                    />
                </div>

                {/* Propiedades opcionales como pastillas, no como formulario */}
                <div className="flex items-center gap-2 border-t px-4 py-3 flex-wrap">
                    <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger className="h-7 w-auto gap-2 rounded-full border px-2.5 text-[12px] focus:ring-0">
                            <PriorityIcon priority={priority} />
                            {PRIORITY_LABELS[priority]}
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

                    <Input
                        type="date"
                        value={eta}
                        onChange={(e) => setEta(e.target.value)}
                        title="Entrega estimada"
                        className="h-7 w-auto rounded-full border px-2.5 text-[12px] focus-visible:ring-0"
                    />

                    <div className="ml-auto flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={crear} disabled={!listo || saving}>
                            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Crear pedido
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
