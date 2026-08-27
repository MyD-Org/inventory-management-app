"use client"

// Tablero kanban al estilo Linear: columnas sin marco, glifo de estado en el
// encabezado, tarjetas densas y filtros explícitos. El estado se cambia
// ARRASTRANDO la tarjeta; el selector vive en el detalle del pedido.
// Drag & drop con la HTML5 Drag and Drop API nativa, sin dependencias.

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { CalendarClock, Search, TriangleAlert } from "lucide-react"
import { updateOrderStatus } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { BOARD_STATUSES, orderNeedsReview, STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"
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
    items: { quantity: number; product: string }[]
    // Alguna línea no tiene lista de materiales (el producto no matcheó una hoja).
    needs_review: boolean
    // Hay lista, pero una opción pedida no está mapeada y se explotó el material
    // por defecto. Son problemas distintos y se resuelven distinto.
    has_unmapped: boolean
    // null = aún no se emitió. Se usa para marcar tarjetas en la columna
    // "facturado" que todavía necesitan la factura antes de salir.
    alegra_invoice_id: string | null
    modified_at: string | null
    delivery_date_verified_at: string | null
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
                        className="pl-8 h-9 text-base"
                        placeholder="Buscar por número o cliente"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground border rounded px-1 hidden sm:block">
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
                            className={`w-[272px] shrink-0 h-full flex flex-col rounded-lg p-1 -m-1 transition-colors ${
                                over === status && dragging !== null
                                    ? "bg-primary/10 ring-2 ring-primary/60"
                                    : ""
                            }`}
                        >
                            <div className="flex items-center gap-2 px-1 pb-2.5 shrink-0 select-none">
                                <StatusIcon status={status} />
                                <h2 className="text-base font-medium">{STATUS_LABELS[status]}</h2>
                                <span className="text-sm text-muted-foreground tabular-nums">
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
                                            onDragStart={(e) => {
                                                draggedRef.current = true
                                                // Firefox no inicia el arrastre sin dataTransfer cargado.
                                                e.dataTransfer.effectAllowed = "move"
                                                e.dataTransfer.setData("text/plain", String(card.id))
                                                // La foto del arrastre se saca DESPUÉS del render, así que
                                                // si atenuamos la tarjeta ya mismo, arrastramos una copia
                                                // translúcida y sin definición. Fijamos la imagen con la
                                                // tarjeta todavía opaca y recién ahí atenuamos.
                                                e.dataTransfer.setDragImage(e.currentTarget, 20, 20)
                                                const id = card.id
                                                setTimeout(() => setDragging(id), 0)
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
                                            className={`select-none rounded-md border bg-card px-3 py-2.5 cursor-pointer hover:border-foreground/25 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors ${
                                                dragging === card.id ? "opacity-40" : ""
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-sm text-muted-foreground tabular-nums">
                                                    #{card.order_number}
                                                </span>
                                                <PriorityIcon priority={card.priority} />
                                            </div>

                                            <div className="text-base font-medium leading-snug truncate mb-1.5">
                                                {card.customer_name ?? card.customer_external_id}
                                            </div>

                                            {orderNeedsReview({
                                                modified_at: card.modified_at,
                                                delivery_date_verified_at: card.delivery_date_verified_at,
                                            }) && (
                                                <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                                    <TriangleAlert className="h-3 w-3" />
                                                    Modificado — revisar fecha
                                                </div>
                                            )}

                                            {/* Siempre los primeros tres, así la tarjeta
                                                dice algo del trabajo aunque el pedido sea
                                                largo. El resto se cuenta y se ve al abrir. */}
                                            {card.items.length > 0 && (
                                                <div className="text-sm text-muted-foreground/90 mb-1 space-y-0.5">
                                                    {card.items.slice(0, 3).map((i, n) => (
                                                        <div key={n} className="truncate">
                                                            <span className="tabular-nums font-medium text-foreground/80">
                                                                {i.quantity}
                                                            </span>
                                                            {" × "}
                                                            {i.product}
                                                        </div>
                                                    ))}
                                                    {card.items.length > 3 && (
                                                        <div className="text-muted-foreground/70">
                                                            +{card.items.length - 3} más
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                                                <span className="tabular-nums">
                                                    {card.units} {card.units === 1 ? "unidad" : "unidades"}
                                                </span>
                                                <span className="tabular-nums">
                                                    {card.line_count}{" "}
                                                    {card.line_count === 1 ? "producto" : "productos"}
                                                </span>
                                                {card.status === "facturado" && !card.alegra_invoice_id && (
                                                    <span
                                                        className="ml-auto flex items-center gap-1 text-xs font-medium text-destructive"
                                                        title="El pedido está en facturado pero falta emitir la factura"
                                                    >
                                                        <TriangleAlert className="h-3 w-3" />
                                                        Falta factura
                                                    </span>
                                                )}
                                                {card.delivery_date_estimate && (
                                                    <span
                                                        className={`flex items-center gap-1 ${
                                                            card.status === "facturado" && !card.alegra_invoice_id
                                                                ? ""
                                                                : "ml-auto"
                                                        } ${overdue ? "text-destructive font-medium" : ""}`}
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
                                    <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
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
