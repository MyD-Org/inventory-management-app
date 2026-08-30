"use client"

// Tablero kanban al estilo Linear: columnas sin marco, glifo de estado en el
// encabezado, tarjetas densas y filtros explícitos. El estado se cambia
// ARRASTRANDO la tarjeta; el selector vive en el detalle del pedido.
// Drag & drop con la HTML5 Drag and Drop API nativa, sin dependencias.

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { CalendarClock, PackageX, Search, TriangleAlert } from "lucide-react"
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
    units: number
    items: { quantity: number; product: string }[]
    // Alguna línea no tiene lista de materiales (el producto no matcheó una hoja).
    needs_review: boolean
    // Hay lista, pero una opción pedida no está mapeada y se explotó el material
    // por defecto. Son problemas distintos y se resuelven distinto.
    has_unmapped: boolean
    // null = aún no se emitió. Se usa para marcar tarjetas en la columna
    // "por_facturar" que todavía necesitan la factura antes de salir.
    alegra_invoice_id: string | null
    modified_at: string | null
    delivery_date_verified_at: string | null
}

type Filter = "vencidos" | "alta" | "sin_materiales" | null

// Entrega dentro de los próximos 7 días, contando hoy. Los vencidos no cuentan:
// tienen su propio contador y su propio color.
export function isDueWithinAWeek(d: string | null, status: string): boolean {
    if (!d || status === "retirado" || status === "cancelado") return false
    const [y, m, day] = d.split("-").map(Number)
    const eta = new Date(y, m - 1, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const limit = new Date(today)
    limit.setDate(limit.getDate() + 7)
    return eta >= today && eta <= limit
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

export function formatDate(d: string | null): string | null {
    if (!d) return null
    // Viene como "2026-09-05": lo parseamos a mano porque new Date("2026-09-05")
    // es medianoche UTC y en Argentina mostraría el día anterior.
    const [, m, day] = d.split("-").map(Number)
    return `${String(day).padStart(2, "0")} ${MONTHS_SHORT[m - 1]}`
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
    const [filter, setFilter] = useState<Filter>(null)
    const [dragging, setDragging] = useState<number | null>(null)
    const [over, setOver] = useState<string | null>(null)
    // Estado optimista: la tarjeta salta de columna al soltar, sin esperar al server.
    const [moved, setMoved] = useState<Record<number, OrderStatus>>({})
    // Sin esto, soltar la tarjeta dispara el click y navega al detalle sin que
    // nadie lo haya pedido.
    const draggedRef = useRef(false)

    // Atajos al estilo Linear: "/" para buscar, "c" para crear.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
            if (e.metaKey || e.ctrlKey || e.altKey) return
            if (e.key === "/") {
                e.preventDefault()
                // Por el DOM y no por el ref: el <Input> de shadcn envuelve al
                // input nativo y el ref quedaba en null, así que el atajo no
                // hacía nada.
                document.querySelector<HTMLInputElement>("[data-orders-search]")?.focus()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [router])

    const statusOf = (c: BoardCard) => moved[c.id] ?? c.status

    // Los tres problemas que hacen que un pedido no pueda avanzar. Se cuentan
    // arriba y cada uno filtra el tablero: antes había que abrir tarjeta por
    // tarjeta para encontrarlos.
    const isLate = (c: BoardCard) => isOverdue(c.delivery_date_estimate, statusOf(c))
    const needsDateReview = (c: BoardCard) =>
        orderNeedsReview({
            modified_at: c.modified_at,
            delivery_date_verified_at: c.delivery_date_verified_at,
        })
    const missingInvoice = (c: BoardCard) =>
        statusOf(c) === "por_facturar" && !c.alegra_invoice_id
    const counts = {
        vencidos: cards.filter(isLate).length,
        sinMateriales: cards.filter((c) => c.needs_review).length,
        sinFactura: cards.filter(missingInvoice).length,
        estaSemana: cards.filter((c) => isDueWithinAWeek(c.delivery_date_estimate, statusOf(c))).length,
        activos: cards.length,
    }

    const q = query.trim().toLowerCase()
    const visible = cards.filter((c) => {
        if (filter === "vencidos" && !isLate(c)) return false
        if (filter === "alta" && c.priority !== "alta") return false
        if (filter === "sin_materiales" && !c.needs_review) return false
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
        if (result.warning) {
            toast.warning(`Pasó a ${STATUS_LABELS[status]}`, { description: result.warning })
        } else {
            toast.success(`Pasó a ${STATUS_LABELS[status]}`)
        }
        router.refresh()
    }

    return (
        <>
            {/* Lo urgente, contado y clickeable. Las tres primeras celdas son los
                problemas que frenan un pedido; las dos últimas, contexto. */}
            <div className="flex gap-2.5 mb-3 shrink-0 flex-wrap">
                <Stat
                    label="Entrega vencida"
                    value={counts.vencidos}
                    tone="crit"
                    active={filter === "vencidos"}
                    onClick={() => setFilter((f) => (f === "vencidos" ? null : "vencidos"))}
                />
                <Stat
                    label="Sin materiales"
                    value={counts.sinMateriales}
                    tone="warn"
                    active={filter === "sin_materiales"}
                    onClick={() => setFilter((f) => (f === "sin_materiales" ? null : "sin_materiales"))}
                />
                <Stat label="Falta facturar" value={counts.sinFactura} />
                <Stat label="Entregan esta semana" value={counts.estaSemana} />
                <Stat label="Activos" value={counts.activos} />
            </div>

            <div className="flex gap-2 mb-4 shrink-0 flex-wrap items-center">
                <div className="relative max-w-xs flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        data-orders-search
                        className="pl-8 h-9 text-base"
                        placeholder="Buscar por número o cliente"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground border rounded px-1 hidden sm:block">
                        /
                    </kbd>
                </div>

                <Chip active={filter === "alta"} onClick={() => setFilter((f) => (f === "alta" ? null : "alta"))}>
                    Prioridad alta
                </Chip>
                {filter && (
                    <button
                        type="button"
                        onClick={() => setFilter(null)}
                        className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                        Quitar filtro
                    </button>
                )}
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
                            className={`w-[300px] shrink-0 h-full flex flex-col rounded-lg p-1 -m-1 transition-colors ${
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
                                            className={`select-none rounded-lg border bg-card cursor-pointer hover:border-foreground/25 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors flex flex-col gap-2.5 py-3 ${
                                                // La franja al costado se reserva para lo que FRENA la
                                                // salida del pedido. Que falten materiales es parte del
                                                // trabajo normal del taller: se marca con el glifo de
                                                // arriba, no pintando la tarjeta entera.
                                                missingInvoice(card)
                                                    ? "border-l-[3px] border-l-destructive pl-3 pr-3.5"
                                                    : needsDateReview(card)
                                                      ? "border-l-[3px] border-l-amber-500 pl-3 pr-3.5"
                                                      : "px-3.5"
                                            } ${dragging === card.id ? "opacity-40" : ""}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                                    #{card.order_number}
                                                </span>
                                                <div className="ml-auto flex items-center gap-1.5">
                                                    {/* Sin lista de materiales: un glifo, no un cartel. El
                                                        contador de arriba los junta a todos y la lista lo
                                                        escribe con todas las letras. */}
                                                    {card.needs_review && (
                                                        <PackageX
                                                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                                            aria-label="Sin lista de materiales"
                                                        />
                                                    )}
                                                    <PriorityIcon priority={card.priority} />
                                                </div>
                                            </div>

                                            {/* El cliente es lo que identifica el trabajo: va como
                                                título, no como una línea más. */}
                                            <div className="font-display text-[1.05rem] font-semibold leading-tight truncate">
                                                {card.customer_name ?? card.customer_external_id}
                                            </div>

                                            {needsDateReview(card) && (
                                                <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                                    <TriangleAlert className="h-3 w-3" />
                                                    Modificado — revisar fecha
                                                </span>
                                            )}

                                            {/* Siempre los primeros tres, así la tarjeta
                                                dice algo del trabajo aunque el pedido sea
                                                largo. El resto se cuenta y se ve al abrir. */}
                                            {missingInvoice(card) && (
                                                <span
                                                    className="inline-flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive"
                                                    title="El pedido está por facturar pero falta emitir la factura"
                                                >
                                                    <TriangleAlert className="h-3 w-3" />
                                                    Falta emitir la factura
                                                </span>
                                            )}

                                            {card.items.length > 0 && (
                                                <div className="text-sm text-muted-foreground space-y-1">
                                                    {card.items.slice(0, 3).map((i, n) => (
                                                        <div key={n} className="truncate">
                                                            <span className="font-mono tabular-nums font-medium text-foreground">
                                                                {i.quantity}
                                                            </span>
                                                            {" × "}
                                                            {i.product}
                                                        </div>
                                                    ))}
                                                    {card.items.length > 3 && (
                                                        <div className="text-xs text-muted-foreground/80">
                                                            +{card.items.length - 3} más
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Una línea separa el trabajo de sus metadatos. */}
                                            <div className="flex items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
                                                <span className="font-mono tabular-nums shrink-0">
                                                    {card.units} u.
                                                </span>
                                                <div className="flex items-center gap-2 min-w-0 justify-end">
                                                    {card.delivery_date_estimate && (
                                                        <span
                                                            className={`inline-flex items-center gap-1 shrink-0 font-mono tabular-nums ${overdue ? "text-destructive font-medium" : ""}`}
                                                            title={overdue ? "La entrega ya venció" : "Entrega estimada"}
                                                        >
                                                            <CalendarClock className="h-3 w-3" />
                                                            {formatDate(card.delivery_date_estimate)}
                                                        </span>
                                                    )}
                                                </div>
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


// Celda del resumen. Las de problema van teñidas y filtran al clickearlas; las
// de contexto son solo un número y no hacen nada.
function Stat({
    label,
    value,
    tone,
    active,
    onClick,
}: {
    label: string
    value: number
    tone?: "crit" | "warn"
    active?: boolean
    onClick?: () => void
}) {
    // Sin casos no hay problema que mostrar: la celda se apaga en lugar de
    // gritar un cero en rojo.
    const lit = Boolean(tone) && value > 0
    const palette = !lit
        ? "bg-muted/60 border-border text-muted-foreground"
        : tone === "crit"
          ? "bg-destructive/10 border-transparent text-destructive"
          : "bg-amber-100 border-transparent text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"

    const content = (
        <>
            <span className="text-sm leading-tight">{label}</span>
            <span className={`font-display text-2xl font-semibold tabular-nums leading-none ${lit ? "" : "text-foreground"}`}>
                {value}
            </span>
        </>
    )
    const base = `flex-1 min-w-[140px] rounded-lg border px-3.5 py-2.5 flex flex-col gap-1 text-left transition-colors ${palette}`

    if (!onClick) return <div className={base}>{content}</div>

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            disabled={value === 0}
            className={`${base} ${value === 0 ? "cursor-default" : "hover:brightness-97 cursor-pointer"} ${
                active ? "ring-2 ring-inset ring-current" : ""
            } outline-none focus-visible:ring-2 focus-visible:ring-primary`}
        >
            {content}
        </button>
    )
}

function Chip({
    active,
    onClick,
    children,
}: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                    ? "border-primary bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:border-foreground/25"
            }`}
        >
            {children}
        </button>
    )
}
