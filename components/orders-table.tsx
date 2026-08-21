"use client"

// Vista de lista, la otra mitad del interruptor del tablero. Filas densas de una
// línea al estilo Linear, sin marco de tabla: glifo de estado, número, cliente y
// metadatos a la derecha. El estado es de solo lectura acá — se cambia
// arrastrando en el tablero o con el selector del detalle.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Trash2, ExternalLink, PackageX, CalendarClock } from "lucide-react"
import { deleteOrder } from "@/lib/order-actions"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { STATUS_LABELS } from "@/lib/order-statuses"
import { PriorityIcon, StatusIcon } from "@/components/order-glyphs"
import { formatDate, isOverdue, type BoardCard } from "@/components/orders-board"

export function OrdersTable({ orders, isAdmin }: { orders: BoardCard[]; isAdmin: boolean }) {
    const router = useRouter()
    const { toast } = useToast()
    const [pendingId, setPendingId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)

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

    if (orders.length === 0) {
        return <p className="text-sm text-muted-foreground py-12 text-center">Todavía no hay pedidos.</p>
    }

    return (
        <>
            <div className="border rounded-lg divide-y">
                {orders.map((o) => {
                    const overdue = isOverdue(o.delivery_date_estimate, o.status)
                    return (
                        <div
                            key={o.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => router.push(`/pedidos/${o.id}`)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") router.push(`/pedidos/${o.id}`)
                            }}
                            className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary first:rounded-t-lg last:rounded-b-lg"
                        >
                            <PriorityIcon priority={o.priority} />
                            <StatusIcon status={o.status} />

                            <span className="text-xs text-muted-foreground tabular-nums w-10 shrink-0">
                                #{o.order_number}
                            </span>

                            <span className="text-sm font-medium truncate min-w-0 flex-1">
                                {o.customer_name ?? o.customer_external_id}
                            </span>

                            {o.needs_review && (
                                <span className="flex items-center gap-1 text-xs text-destructive shrink-0 whitespace-nowrap">
                                    <PackageX className="h-3 w-3" />
                                    Sin materiales
                                </span>
                            )}

                            <span className="text-xs text-muted-foreground tabular-nums hidden sm:block shrink-0">
                                {o.units} u.
                            </span>

                            <span className="text-xs text-muted-foreground hidden md:block shrink-0 w-24 truncate">
                                {STATUS_LABELS[o.status]}
                            </span>

                            <span
                                className={`text-xs flex items-center gap-1 shrink-0 w-20 justify-end ${
                                    overdue ? "text-destructive font-medium" : "text-muted-foreground"
                                }`}
                            >
                                {o.delivery_date_estimate && (
                                    <>
                                        <CalendarClock className="h-3 w-3" />
                                        {formatDate(o.delivery_date_estimate)}
                                    </>
                                )}
                            </span>

                            <div className="flex items-center gap-0.5 shrink-0 w-14 justify-end">
                                {o.source_conversation && (
                                    <a
                                        href={o.source_conversation}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        title="Ver la conversación en el CRM"
                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Button variant="ghost" size="icon" className="h-7 w-7">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </Button>
                                    </a>
                                )}
                                {isAdmin && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setPendingId(o.id)
                                        }}
                                        title="Eliminar pedido"
                                    >
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

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
        </>
    )
}
