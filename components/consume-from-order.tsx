"use client"

// Descontar los materiales de un pedido, desde el inventario. Es el mismo flujo
// que hay en el detalle del pedido (sugiere lo pendiente y lo dejás editar),
// pero acá elegís el pedido en vez de venir de él: sirve para el que trabaja
// en el depósito y no entra al módulo del taller.

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ExternalLink, PackageMinus } from "lucide-react"
import { getOrderNeeds, listOrdersWithPendingMaterials } from "@/lib/order-actions"
import { ConsumeMaterialsForm } from "@/components/consume-materials-form"
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
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        listOrdersWithPendingMaterials().then(setOrders)
    }, [])

    async function elegir(value: string) {
        setOrderId(value)
        setLoading(true)
        const n = await getOrderNeeds(Number(value))
        setLoading(false)
        setNeeds(n)
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
                    <p className="text-base text-muted-foreground">
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

            {loading && <p className="text-base text-muted-foreground">Buscando los materiales…</p>}

            {needs && !loading && (
                pendientes.length === 0 ? (
                    <p className="text-base text-muted-foreground">
                        Este pedido ya tiene todos sus materiales descontados.
                    </p>
                ) : (
                    <div className="space-y-2">
                        <ConsumeMaterialsForm
                            orderId={Number(orderId)}
                            needs={needs}
                            onDone={async () => {
                                await elegir(orderId)
                                router.refresh()
                            }}
                        />
                    </div>
                )
            )}
        </div>
    )
}
