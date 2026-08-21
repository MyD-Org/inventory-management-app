"use client"

// Qué ve el cliente por cada estado interno del tablero. El doc del CRM lo pide
// configurable: "esperando MP" es útil adentro y confuso afuera.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { saveCustomerStatusMap } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { ORDER_STATUSES, STATUS_LABELS } from "@/lib/order-statuses"

export function CustomerStatusMap({ current }: { current: Record<string, string> }) {
    const router = useRouter()
    const { toast } = useToast()
    const [map, setMap] = useState<Record<string, string>>(current)
    const [saving, setSaving] = useState(false)

    async function save() {
        setSaving(true)
        const result = await saveCustomerStatusMap(map)
        setSaving(false)
        if (result.error) toast.error("Error", { description: result.error })
        else {
            toast.success("Guardado")
            router.refresh()
        }
    }

    return (
        <div className="rounded-md border p-4">
            <h2 className="font-semibold">Qué ve el cliente</h2>
            <p className="text-base text-muted-foreground mb-4">
                Cuando el cliente pregunta por su pedido, el asistente le contesta con este texto en
                vez del estado interno del tablero.
            </p>

            <div className="space-y-2">
                {ORDER_STATUSES.map((s) => (
                    <div key={s} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <span className="text-base text-muted-foreground text-right">{STATUS_LABELS[s]}</span>
                        <span className="text-muted-foreground">→</span>
                        <Input
                            value={map[s] ?? ""}
                            placeholder={STATUS_LABELS[s]}
                            onChange={(e) => setMap((m) => ({ ...m, [s]: e.target.value }))}
                        />
                    </div>
                ))}
            </div>

            <div className="flex justify-end mt-4">
                <Button onClick={save} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar
                </Button>
            </div>
        </div>
    )
}
