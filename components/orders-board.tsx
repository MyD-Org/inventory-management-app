"use client"

// Tablero kanban de pedidos. El estado se cambia ARRASTRANDO la tarjeta de una
// columna a otra, y solo así: el selector vive en el detalle del pedido.
// Drag & drop con la HTML5 Drag and Drop API nativa, sin dependencias.

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CalendarClock, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { updateOrderStatus } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { BOARD_STATUSES, STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"

export interface BoardCard {
    id: number
    order_number: number
    external_id: string
    customer_name: string | null
    customer_external_id: string
    status: OrderStatus
    priority: string
    delivery_date_estimate: string | null
    line_count: number
    units: number
    needs_review: boolean
}

function formatDate(d: string | null): string | null {
    if (!d) return null
    // El valor viene como "2026-09-05": lo parseamos a mano para que no lo
    // corra la zona horaria (new Date("2026-09-05") es UTC medianoche).
    const [y, m, day] = d.split("-").map(Number)
    return new Date(y, m - 1, day).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
}

// Entrega vencida: la fecha ya pasó y el pedido todavía no salió.
function isOverdue(d: string | null, status: string): boolean {
    if (!d || status === "retirado") return false
    const [y, m, day] = d.split("-").map(Number)
    const eta = new Date(y, m - 1, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return eta < today
}

export function OrdersBoard({ cards }: { cards: BoardCard[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [query, setQuery] = useState("")
    const [onlyIssues, setOnlyIssues] = useState(false)
    const [dragging, setDragging] = useState<number | null>(null)
    const [over, setOver] = useState<string | null>(null)
    // Estado optimista: la tarjeta salta de columna al soltar, sin esperar al server.
    const [moved, setMoved] = useState<Record<number, OrderStatus>>({})

    const statusOf = (c: BoardCard) => moved[c.id] ?? c.status

    const q = query.trim().toLowerCase()
    const visible = cards.filter((c) => {
        if (onlyIssues && !c.needs_review && !isOverdue(c.delivery_date_estimate, statusOf(c))) return false
        if (!q) return true
        return (
            String(c.order_number).includes(q) ||
            (c.customer_name ?? "").toLowerCase().includes(q) ||
            c.customer_external_id.toLowerCase().includes(q)
        )
    })

    async function move(id: number, status: OrderStatus) {
        const previous = cards.find((c) => c.id === id)?.status
        if (previous === status) return

        setMoved((m) => ({ ...m, [id]: status }))
        const result = await updateOrderStatus(id, status)
        if (result.error) {
            setMoved((m) => {
                const next = { ...m }
                delete next[id]
                return next
            })
            toast.error("No se pudo mover", { description: result.error })
            return
        }
        router.refresh()
    }

    return (
        // min-h-0 deja que el flex hijo se encoja en vez de estirar la página;
        // scrollbar-hide oculta la barra horizontal sin desactivar el scroll.
        <>
        <div className="flex gap-2 mb-4 shrink-0 flex-wrap">
            <div className="relative max-w-xs flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    className="pl-8"
                    placeholder="Buscar por número o cliente"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>
            <Button
                variant={onlyIssues ? "default" : "outline"}
                onClick={() => setOnlyIssues((v) => !v)}
            >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Solo con problemas
            </Button>
        </div>
        <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto scrollbar-hide pb-2">
            {BOARD_STATUSES.map((status) => {
                const column = visible.filter((c) => statusOf(c) === status)
                return (
                    <div
                        key={status}
                        onDragOver={(e) => {
                            e.preventDefault()
                            setOver(status)
                        }}
                        onDragLeave={() => setOver((o) => (o === status ? null : o))}
                        onDrop={(e) => {
                            e.preventDefault()
                            setOver(null)
                            if (dragging !== null) move(dragging, status)
                            setDragging(null)
                        }}
                        className={`w-72 shrink-0 h-full flex flex-col rounded-lg border bg-muted/30 p-3 transition-colors ${
                            over === status ? "border-primary bg-primary/5" : ""
                        }`}
                    >
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <h2 className="text-sm font-semibold">{STATUS_LABELS[status]}</h2>
                            <span className="text-xs text-muted-foreground tabular-nums">{column.length}</span>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-2">
                            {column.map((card) => (
                                <div
                                    key={card.id}
                                    draggable
                                    onDragStart={() => setDragging(card.id)}
                                    onDragEnd={() => setDragging(null)}
                                    className={`rounded-md border bg-background p-3 space-y-2 cursor-grab active:cursor-grabbing ${
                                        dragging === card.id ? "opacity-50" : ""
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <Link
                                            href={`/pedidos/${card.id}`}
                                            className="font-medium text-sm hover:underline"
                                        >
                                            #{card.order_number}
                                        </Link>
                                        {card.priority === "alta" && (
                                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                                Urgente
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="text-sm truncate">{card.customer_name ?? card.customer_external_id}</div>

                                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                        <span>
                                            {card.units} u. · {card.line_count} {card.line_count === 1 ? "línea" : "líneas"}
                                        </span>
                                        {card.delivery_date_estimate && (
                                            <span
                                                className={`flex items-center gap-1 ${
                                                    isOverdue(card.delivery_date_estimate, statusOf(card))
                                                        ? "text-destructive font-medium"
                                                        : ""
                                                }`}
                                                title={
                                                    isOverdue(card.delivery_date_estimate, statusOf(card))
                                                        ? "La fecha de entrega ya pasó"
                                                        : "Entrega estimada"
                                                }
                                            >
                                                <CalendarClock className="h-3 w-3" />
                                                {formatDate(card.delivery_date_estimate)}
                                            </span>
                                        )}
                                    </div>

                                    {card.needs_review && (
                                        <div className="flex items-center gap-1 text-xs text-destructive">
                                            <AlertTriangle className="h-3 w-3" />
                                            Sin receta
                                        </div>
                                    )}

                                </div>
                            ))}

                            {column.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">Vacío</p>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
        </>
    )
}
