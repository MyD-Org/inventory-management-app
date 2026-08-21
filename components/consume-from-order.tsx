"use client"

// Descontar los materiales de un pedido, desde el inventario. Es el mismo flujo
// que hay en el detalle del pedido (sugiere lo pendiente y lo dejás editar),
// pero acá elegís el pedido en vez de venir de él: sirve para el que trabaja
// en el depósito y no entra al módulo del taller.

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ExternalLink, Loader2, PackageMinus } from "lucide-react"
import {
    consumeOrderMaterials,
    getOrderNeeds,
    listOrdersWithPendingMaterials,
} from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import type { MaterialNeed } from "@/lib/orders"

interface OrderOption {
    id: number
    order_number: number
    customer: string
}

export function ConsumeFromOrder() {
    const router = useRouter()
    const { toast } = useToast()
    const [orders, setOrders] = useState<OrderOption[]>([])
    const [orderId, setOrderId] = useState<string>("")
    const [needs, setNeeds] = useState<MaterialNeed[] | null>(null)
    const [cant, setCant] = useState<Record<number, number>>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        listOrdersWithPendingMaterials().then(setOrders)
    }, [])

    async function elegir(value: string) {
        setOrderId(value)
        setLoading(true)
        const n = await getOrderNeeds(Number(value))
        setLoading(false)
        setNeeds(n)
        const inicial: Record<number, number> = {}
        for (const m of n) {
            // Sugerimos lo que falta descontar, sin pasarnos de lo que hay.
            if (m.material_id !== null && m.pending > 0) {
                inicial[m.material_id] = Math.min(m.pending, m.available ?? m.pending)
            }
        }
        setCant(inicial)
    }

    async function descontar() {
        setSaving(true)
        const result = await consumeOrderMaterials(
            Number(orderId),
            Object.entries(cant).map(([id, quantity]) => ({ material_id: Number(id), quantity })),
        )
        setSaving(false)
        if (result.error) {
            toast.error("No se pudo descontar", { description: result.error })
            return
        }
        toast.success(`${result.count} materiales descontados`)
        await elegir(orderId)
        router.refresh()
    }

    if (orders.length === 0) return null

    const pendientes = (needs ?? []).filter((n) => n.material_id !== null && n.pending > 0)

    return (
        <div className="rounded-lg border p-4 mb-6">
            <div className="flex items-center gap-3 flex-wrap mb-3">
                <div>
                    <h2 className="font-semibold flex items-center gap-2">
                        <PackageMinus className="h-4 w-4" />
                        Descontar los materiales de un pedido
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Trae la lista de materiales del pedido y sugiere cuánto descontar. Podés ajustarlo.
                    </p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <Select value={orderId} onValueChange={elegir}>
                        <SelectTrigger className="w-[260px]">
                            <SelectValue placeholder="Elegí un pedido" />
                        </SelectTrigger>
                        <SelectContent>
                            {orders.map((o) => (
                                <SelectItem key={o.id} value={String(o.id)}>
                                    #{o.order_number} · {o.customer}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {orderId && (
                        <Link href={`/pedidos/${orderId}`} target="_blank" title="Ver el pedido">
                            <Button variant="ghost" size="icon">
                                <ExternalLink className="h-4 w-4" />
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {loading && <p className="text-sm text-muted-foreground">Buscando los materiales…</p>}

            {needs && !loading && (
                pendientes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Este pedido ya tiene todos sus materiales descontados.
                    </p>
                ) : (
                    <>
                        <div className="divide-y border rounded-md">
                            {pendientes.map((n) => {
                                const valor = cant[n.material_id!] ?? 0
                                const excede = n.available !== null && valor > n.available
                                return (
                                    <div key={n.material_id} className="flex items-center gap-3 px-3 py-1.5">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={n.available ?? undefined}
                                            value={valor}
                                            onChange={(e) =>
                                                setCant((c) => ({
                                                    ...c,
                                                    [n.material_id!]: Number(e.target.value),
                                                }))
                                            }
                                            className={`h-8 w-20 text-[13px] ${excede ? "border-destructive" : ""}`}
                                        />
                                        <span className="text-sm flex-1 min-w-0 truncate">{n.label}</span>
                                        <span
                                            className={`text-xs shrink-0 ${
                                                n.available !== null && n.available < n.pending
                                                    ? "text-destructive"
                                                    : "text-muted-foreground"
                                            }`}
                                        >
                                            necesita {n.pending} · hay {n.available ?? "—"}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex justify-end mt-3">
                            <Button size="sm" onClick={descontar} disabled={saving}>
                                {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                Descontar del inventario
                            </Button>
                        </div>
                    </>
                )
            )}
        </div>
    )
}
