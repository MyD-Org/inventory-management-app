"use client"

// Tablero kanban al estilo Linear: columnas sin marco, glifo de estado en el
// encabezado, tarjetas densas y filtros explícitos. El estado se cambia
// ARRASTRANDO la tarjeta; el selector vive en el detalle del pedido.
// Drag & drop con la HTML5 Drag and Drop API nativa, sin dependencias.

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { CalendarClock, Search, PackageX } from "lucide-react"
import { updateOrderStatus } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { BOARD_STATUSES, STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"
import { PriorityIcon, StatusIcon } from "@/components/order-glyphs"

export interface BoardCard {
    id: number
    order_number: number
    external_id: string
    customer_name: string | null
    customer_external_id: string
    status: OrderStatus
    priority: string
    delivery_date_estimate: string | null
    origin: string
    source_conversation: string | null
    created_at: string
    line_count: number
    units: number
    needs_review: boolean
}

export function formatDate(d: string | null): string | null {
    if (!d) return null
    // Viene como "2026-09-05": lo parseamos a mano porque new Date("2026-09-05")
    // es medianoche UTC y en Argentina mostraría el día anterior.
    const [y, m, day] = d.split("-").map(Number)
    return new Date(y, m - 1, day).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
}

// Entrega vencida: la fecha ya pasó y el pedido todavía no salió.
export function isOverdue(d: string | null, status: string): boolean {
    if (!d || status === "retirado" || status === "cancelado") return false
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
    const [dragging, setDragging] = useState<number | null>(null)
    const [over, setOver] = useState<string | null>(null)
    // Estado optimista: la tarjeta salta de columna al soltar, sin esperar al server.
    const [moved, setMoved] = useState<Record<number, OrderStatus>>({})
    // Sin esto, soltar la tarjeta dispara el click y navega al detalle sin que
    // nadie lo haya pedido.
    const draggedRef = useRef(false)
    const searchRef = useRef<HTMLInputElement>(null)

    // Atajos al estilo Linear: "/" para buscar, "c" para crear.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
            if (e.metaKey || e.ctrlKey || e.altKey) return
            if (e.key === "/") {
                e.preventDefault()
                searchRef.current?.focus()
            } else if (e.key === "c") {
                e.preventDefault()
                router.push("/pedidos/nuevo")
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [router])

    const statusOf = (c: BoardCard) => moved[c.id] ?? c.status

    const q = query.trim().toLowerCase()
    const visible = cards.filter((c) => {
        if (!q) return true
        return (
            String(c.order_number).includes(q) ||
            (c.customer_name ?? "").toLowerCase().includes(q) ||
            c.customer_external_id.toLowerCase().includes(q)
        )
    })

    async function move(id: number, status: OrderStatus) {
        if ((cards.find((c) => c.id === id)?.status ?? null) === status) return

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
        <>
            <div className="flex gap-2 mb-4 shrink-0 flex-wrap items-center">
                <div className="relative max-w-xs flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        ref={searchRef}
                        className="pl-8 h-9 text-sm"
                        placeholder="Buscar por número o cliente"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground border rounded px-1 hidden sm:block">
                        /
                    </kbd>
                </div>

            </div>

            <div className="flex-1 min-h-0 flex gap-5 overflow-x-auto scrollbar-hide pb-2">
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
                            className={`w-[272px] shrink-0 h-full flex flex-col rounded-lg transition-colors ${
                                over === status ? "bg-primary/5 ring-1 ring-primary/30" : ""
                            }`}
                        >
                            <div className="flex items-center gap-2 px-1 pb-2.5 shrink-0">
                                <StatusIcon status={status} />
                                <h2 className="text-[13px] font-medium">{STATUS_LABELS[status]}</h2>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {column.length}
                                </span>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1.5">
                                {column.map((card) => {
                                    const overdue = isOverdue(card.delivery_date_estimate, statusOf(card))
                                    return (
                                        <div
                                            key={card.id}
                                            draggable
                                            onDragStart={() => {
                                                draggedRef.current = true
                                                setDragging(card.id)
                                            }}
                                            onDragEnd={() => setDragging(null)}
                                            onClick={() => {
                                                if (draggedRef.current) {
                                                    draggedRef.current = false
                                                    return
                                                }
                                                router.push(`/pedidos/${card.id}`)
                                            }}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault()
                                                    router.push(`/pedidos/${card.id}`)
                                                }
                                            }}
                                            className={`rounded-md border bg-card px-3 py-2.5 cursor-pointer hover:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${
                                                dragging === card.id ? "opacity-40" : ""
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-[11px] text-muted-foreground tabular-nums">
                                                    #{card.order_number}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {card.needs_review && (
                                                        <PackageX
                                                            className="h-3.5 w-3.5 text-destructive"
                                                            aria-label="Sin receta"
                                                        />
                                                    )}
                                                    <PriorityIcon priority={card.priority} />
                                                </div>
                                            </div>

                                            <div className="text-[13px] font-medium leading-snug truncate mb-1.5">
                                                {card.customer_name ?? card.customer_external_id}
                                            </div>

                                            <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                                                <span className="tabular-nums">{card.units} u.</span>
                                                <span className="tabular-nums">
                                                    {card.line_count} {card.line_count === 1 ? "línea" : "líneas"}
                                                </span>
                                                {card.delivery_date_estimate && (
                                                    <span
                                                        className={`flex items-center gap-1 ml-auto ${
                                                            overdue ? "text-destructive font-medium" : ""
                                                        }`}
                                                        title={overdue ? "La entrega ya venció" : "Entrega estimada"}
                                                    >
                                                        <CalendarClock className="h-3 w-3" />
                                                        {formatDate(card.delivery_date_estimate)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}

                                {column.length === 0 && (
                                    <div className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
                                        Vacío
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </>
    )
}
