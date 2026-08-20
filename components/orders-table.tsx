"use client"

// Tabla de pedidos con filtro por cliente y cambio de estado en línea.
// El estado que se guarda es el INTERNO del tablero; el cliente ve la traducción
// que devuelve GET /api/pedidos (customer_status en lib/orders.ts).

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, ExternalLink, AlertTriangle, Search } from "lucide-react"
import { deleteOrder, updateOrderStatus } from "@/lib/order-actions"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useToast } from "@/hooks/use-toast"

export interface OrderRow {
    id: number
    external_id: string
    customer_external_id: string
    customer_name: string | null
    status: string
    source_conversation: string | null
    created_at: string
    line_count: number
    total: number
    needs_review: boolean
}

const STATUS_LABELS: Record<string, string> = {
    recibido: "Recibido",
    en_produccion: "En producción",
    listo: "Listo",
    entregado: "Entregado",
    cancelado: "Cancelado",
}

function formatArs(n: number): string {
    return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}

export function OrdersTable({
    orders,
    initialFilter,
    isAdmin,
}: {
    orders: OrderRow[]
    initialFilter: string
    isAdmin: boolean
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [filter, setFilter] = useState(initialFilter)
    const [pendingId, setPendingId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [isPending, startTransition] = useTransition()

    function applyFilter(e: React.FormEvent) {
        e.preventDefault()
        const q = filter.trim()
        router.push(q ? `/pedidos?cliente=${encodeURIComponent(q)}` : "/pedidos")
    }

    async function changeStatus(id: number, status: string) {
        const result = await updateOrderStatus(id, status)
        if (result.error) {
            toast.error("Error", { description: result.error })
        } else {
            toast.success("Estado actualizado")
            startTransition(() => router.refresh())
        }
    }

    async function doDelete() {
        if (pendingId == null) return
        setDeleting(true)
        const result = await deleteOrder(pendingId)
        setDeleting(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
        } else {
            setPendingId(null)
            toast.success("Pedido eliminado")
            router.refresh()
        }
    }

    return (
        <div className="space-y-4">
            <form onSubmit={applyFilter} className="flex gap-2 max-w-md">
                <Input
                    placeholder="Filtrar por cliente (ID externo o nombre)"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <Button type="submit" variant="secondary">
                    <Search className="h-4 w-4" />
                </Button>
            </form>

            {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                    {initialFilter ? "No hay pedidos de ese cliente." : "Todavía no hay pedidos."}
                </p>
            ) : (
                <div className="rounded-md border overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Pedido</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead className="text-right">Líneas</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.map((o) => (
                                <TableRow key={o.id}>
                                    <TableCell>
                                        <Link href={`/pedidos/${o.id}`} className="font-medium hover:underline">
                                            {o.external_id}
                                        </Link>
                                        {o.needs_review && (
                                            <Badge variant="destructive" className="ml-2 gap-1">
                                                <AlertTriangle className="h-3 w-3" />
                                                Revisar
                                            </Badge>
                                        )}
                                        <div className="text-xs text-muted-foreground">
                                            {new Date(o.created_at).toLocaleDateString("es-AR")}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>{o.customer_name ?? "—"}</div>
                                        <div className="text-xs text-muted-foreground">{o.customer_external_id}</div>
                                    </TableCell>
                                    <TableCell className="text-right">{o.line_count}</TableCell>
                                    <TableCell className="text-right">{formatArs(o.total)}</TableCell>
                                    <TableCell>
                                        <Select value={o.status} onValueChange={(v) => changeStatus(o.id, v)}>
                                            <SelectTrigger className="w-[150px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                                    <SelectItem key={value} value={value}>
                                                        {label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-end gap-1">
                                            {o.source_conversation && (
                                                <a
                                                    href={o.source_conversation}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Ver la conversación en el CRM"
                                                >
                                                    <Button variant="ghost" size="icon">
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Button>
                                                </a>
                                            )}
                                            {isAdmin && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setPendingId(o.id)}
                                                    title="Eliminar pedido"
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            <ConfirmDialog
                open={pendingId !== null}
                onOpenChange={(open) => !open && setPendingId(null)}
                title="Eliminar pedido"
                description="Se borran también sus líneas y la lista de materiales. No se puede deshacer."
                confirmLabel="Eliminar"
                destructive
                loading={deleting}
                onConfirm={doDelete}
            />
        </div>
    )
}
