"use client"

// Único lugar donde el estado se cambia con un desplegable: en el tablero se
// cambia arrastrando. Muestra el mismo glifo que el tablero, para que el estado
// se lea igual en las dos pantallas.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { updateOrderStatus } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"
import { StatusIcon } from "@/components/order-glyphs"

export function OrderStatusSelect({ id, status }: { id: number; status: OrderStatus }) {
    const router = useRouter()
    const { toast } = useToast()
    const [value, setValue] = useState<OrderStatus>(status)
    const [saving, setSaving] = useState(false)

    async function change(next: string) {
        const previous = value
        setValue(next as OrderStatus)
        setSaving(true)
        const result = await updateOrderStatus(id, next)
        setSaving(false)
        if (result.error) {
            setValue(previous)
            toast.error("No se pudo cambiar el estado", { description: result.error })
            return
        }
        if (result.warning) {
            toast.warning(`Pasó a ${STATUS_LABELS[next as OrderStatus]}`, { description: result.warning })
        } else {
            toast.success(`Pasó a ${STATUS_LABELS[next as OrderStatus]}`)
        }
        router.refresh()
    }

    // Pasar a "Facturar y remitir" emite los dos documentos en Alegra: dos llamadas
    // de red. Sin una señal, el desplegable se queda mudo y quieto varios segundos
    // y parece que no pasó nada.
    const emitiendo = saving && value === "por_facturar"

    return (
        <div className="flex items-center gap-2">
            <Select value={value} onValueChange={change} disabled={saving}>
            <SelectTrigger // w-fit: el control se ajusta al texto. Con w-full el recuadro tomaba
                // toda la celda y parecía un campo vacío enorme.
                // dark:bg-transparent: el Select de shadcn trae un relleno propio
                // en oscuro (dark:bg-input/30) que bg-transparent no pisa, porque
                // son variantes distintas y tailwind-merge conserva las dos.
                className="h-7 w-fit max-w-full border-0 bg-transparent dark:bg-transparent px-1.5 text-base hover:bg-muted focus:ring-0 justify-start gap-2">
                <StatusIcon status={value} />
                <span>{STATUS_LABELS[value]}</span>
            </SelectTrigger>
            <SelectContent>
                {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-base">
                        <span className="flex items-center gap-2">
                            <StatusIcon status={s} />
                            {STATUS_LABELS[s]}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
            </Select>
            {emitiendo && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Emitiendo factura y remito…
                </span>
            )}
        </div>
    )
}
