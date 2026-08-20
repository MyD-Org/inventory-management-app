"use client"

// Único lugar donde el estado se cambia con un desplegable. En el tablero se
// cambia arrastrando la tarjeta; la lista lo muestra de solo lectura.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateOrderStatus } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"

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
            <SelectTrigger className="w-[190px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
