"use client"

// Propiedades editables en el lugar, al estilo Linear: el control ES el valor,
// sin modo edición ni botón guardar. Cada cambio se guarda solo al salir del
// campo (o al elegir, en los desplegables).

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { updateOrderFields } from "@/lib/order-actions"
import { PriorityIcon } from "@/components/order-glyphs"

const PRIORITY_LABELS: Record<string, string> = { baja: "Baja", normal: "Normal", alta: "Alta" }

function useSaver(id: number) {
    const router = useRouter()
    const { toast } = useToast()
    return async function save(patch: Parameters<typeof updateOrderFields>[1], label: string) {
        const result = await updateOrderFields(id, patch)
        if (result.error) toast.error("No se pudo guardar", { description: result.error })
        else {
            toast.success(label)
            router.refresh()
        }
    }
}

export function PriorityField({ id, value }: { id: number; value: string }) {
    const save = useSaver(id)
    const [v, setV] = useState(value)

    return (
        <Select
            value={v}
            onValueChange={(next) => {
                setV(next)
                save({ priority: next }, "Prioridad actualizada")
            }}
        >
            <SelectTrigger className="h-7 w-full border-0 bg-transparent px-1.5 text-[13px] hover:bg-muted focus:ring-0 justify-start gap-2 -ml-1.5">
                <PriorityIcon priority={v} />
                <span>{PRIORITY_LABELS[v] ?? v}</span>
            </SelectTrigger>
            <SelectContent>
                {["baja", "normal", "alta"].map((p) => (
                    <SelectItem key={p} value={p} className="text-[13px]">
                        <span className="flex items-center gap-2">
                            <PriorityIcon priority={p} />
                            {PRIORITY_LABELS[p]}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

export function DateField({ id, value }: { id: number; value: string | null }) {
    const save = useSaver(id)
    const [v, setV] = useState(value ?? "")

    return (
        <Input
            type="date"
            value={v}
            onChange={(e) => setV(e.target.value)}
            onBlur={() => {
                if ((value ?? "") === v) return
                save({ delivery_date_estimate: v }, "Fecha de entrega actualizada")
            }}
            className="h-7 border-0 bg-transparent px-1.5 -ml-1.5 text-[13px] hover:bg-muted focus-visible:ring-0 w-full"
        />
    )
}

export function TextField({
    id,
    value,
    field,
    placeholder,
    label,
}: {
    id: number
    value: string | null
    field: "customer_name" | "customer_phone"
    placeholder: string
    label: string
}) {
    const save = useSaver(id)
    const [v, setV] = useState(value ?? "")

    return (
        <Input
            value={v}
            placeholder={placeholder}
            onChange={(e) => setV(e.target.value)}
            onBlur={() => {
                if ((value ?? "") === v) return
                save({ [field]: v } as any, `${label} actualizado`)
            }}
            className="h-7 border-0 bg-transparent px-1.5 -ml-1.5 text-[13px] hover:bg-muted focus-visible:ring-0 w-full"
        />
    )
}

export function NotesField({ id, value }: { id: number; value: string | null }) {
    const save = useSaver(id)
    const [v, setV] = useState(value ?? "")

    return (
        <Textarea
            value={v}
            rows={2}
            placeholder="Notas para el taller"
            onChange={(e) => setV(e.target.value)}
            onBlur={() => {
                if ((value ?? "") === v) return
                save({ notes: v }, "Notas actualizadas")
            }}
            className="text-[13px] resize-none bg-muted/50 border-0 focus-visible:ring-1"
        />
    )
}
