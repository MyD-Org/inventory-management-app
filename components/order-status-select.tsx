"use client"

// Único lugar donde el estado se cambia con un desplegable: en el tablero se
// cambia arrastrando. Muestra el mismo glifo que el tablero, para que el estado
// se lea igual en las dos pantallas.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useOrderEmission } from "@/components/order-emission"
import { updateOrderStatus } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"
import { StatusIcon } from "@/components/order-glyphs"

export function OrderStatusSelect({
    id,
    status,
    hasInvoice = false,
    hasRemission = false,
}: {
    id: number
    status: OrderStatus
    /** Qué documentos YA existen: define qué va a emitirse al pasar a facturar. */
    hasInvoice?: boolean
    hasRemission?: boolean
}) {
    const router = useRouter()
    const { setEmitiendo } = useOrderEmission()
    const { toast } = useToast()
    const [value, setValue] = useState<OrderStatus>(status)
    const [saving, setSaving] = useState(false)

    async function change(next: string) {
        const previous = value
        setValue(next as OrderStatus)
        setSaving(true)
        // Pasar a "Facturar y remitir" emite en Alegra lo que falte. Se avisa en la
        // celda de cada documento que se va a emitir —y solo en esa— mientras dura.
        const emitiendo = { invoice: false, remission: false }
        if (next === "por_facturar") {
            emitiendo.invoice = !hasInvoice
            emitiendo.remission = !hasRemission
        }
        setEmitiendo(emitiendo)

        const result = await updateOrderStatus(id, next)
        setSaving(false)
        if (result.error) {
            setValue(previous)
            setEmitiendo({ invoice: false, remission: false })
            toast.error("No se pudo cambiar el estado", { description: result.error })
            return
        }
        if (result.warning) {
            toast.warning(`Pasó a ${STATUS_LABELS[next as OrderStatus]}`, { description: result.warning })
        } else {
            toast.success(`Pasó a ${STATUS_LABELS[next as OrderStatus]}`)
        }
        router.refresh()
        // El aviso se apaga cuando el pedido vuelve a leerse con los documentos ya
        // emitidos. router.refresh() no avisa cuándo terminó, así que lo apaga el
        // remount: la celda se vuelve a montar con el número puesto.
        setEmitiendo({ invoice: false, remission: false })
    }

    return (
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
    )
}
