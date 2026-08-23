"use client"

// Único lugar donde el estado se cambia con un desplegable: en el tablero se
// cambia arrastrando. Muestra el mismo glifo que el tablero, para que el estado
// se lea igual en las dos pantallas.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
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
        toast.success(`Pasó a ${STATUS_LABELS[next as OrderStatus]}`)
        router.refresh()
    }

    return (
        <Select value={value} onValueChange={change} disabled={saving}>
            <SelectTrigger className="h-7 w-full border-0 bg-transparent px-1.5 text-base hover:bg-muted focus:ring-0 justify-start gap-2">
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
