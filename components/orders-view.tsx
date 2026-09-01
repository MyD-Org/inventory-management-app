"use client"

// Envoltorio de las dos vistas de pedidos. El resumen, el buscador y los
// filtros viven ACÁ y no adentro del tablero: son la misma pregunta ("qué está
// para hoy y qué está trabado") sin importar si mirás tarjetas o filas, y
// cuando estaban adentro del tablero la lista se quedaba sin nada.
//
// El interruptor Tablero/Lista sigue siendo un link del server (ViewToggle):
// cambia la URL, no un estado de acá.

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { orderNeedsReview } from "@/lib/order-statuses"
import { OrdersBoard, isOverdue, type BoardCard } from "@/components/orders-board"
import { OrdersTable } from "@/components/orders-table"

type Filter = "vencidos" | "alta" | "sin_materiales" | null

// Entrega dentro de los próximos 7 días, contando hoy. Los vencidos no cuentan:
// tienen su propio contador y su propio color.
function isDueWithinAWeek(d: string | null, status: string): boolean {
    if (!d || status === "retirado" || status === "cancelado") return false
    const [y, m, day] = d.split("-").map(Number)
    const eta = new Date(y, m - 1, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const limit = new Date(today)
    limit.setDate(limit.getDate() + 7)
    return eta >= today && eta <= limit
}

export function OrdersView({
    cards,
    lista,
    isAdmin,
}: {
    cards: BoardCard[]
    lista: boolean
    isAdmin: boolean
}) {
    const [query, setQuery] = useState("")
    const [filter, setFilter] = useState<Filter>(null)
    const searchRef = useRef<HTMLInputElement>(null)

    // Atajo al estilo Linear: "/" enfoca el buscador.
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
    }, [])

    // Los contadores salen SIEMPRE del universo completo, sin importar el filtro
    // activo: si al filtrar "vencidos" el resto se pusiera en cero, no habría
    // forma de saltar de un problema a otro.
    //
    // El tablero excluye los cancelados y la lista no, así que los números
    // acompañan a lo que tenés delante en vez de contar algo que no ves.
    const isLate = (c: BoardCard) => isOverdue(c.delivery_date_estimate, c.status)
    // Un pedido cuenta UNA vez aunque le falten los dos papeles: el contador mide
    // cuántos pedidos están frenados, no cuántos documentos hay que emitir.
    const missingDoc = (c: BoardCard) =>
        c.status === "por_facturar" && (!c.alegra_invoice_id || !c.alegra_remission_id)
    const counts = {
        vencidos: cards.filter(isLate).length,
        sinMateriales: cards.filter((c) => c.needs_review).length,
        sinDocumentos: cards.filter(missingDoc).length,
        estaSemana: cards.filter((c) => isDueWithinAWeek(c.delivery_date_estimate, c.status)).length,
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

    const filtrando = Boolean(filter) || q !== ""

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
                <Stat label="Faltan papeles" value={counts.sinDocumentos} />
                <Stat label="Entregan esta semana" value={counts.estaSemana} />
                <Stat label={lista ? "Pedidos" : "Activos"} value={counts.activos} />
            </div>

            <div className="flex gap-2 mb-4 shrink-0 flex-wrap items-center">
                <div className="relative max-w-xs flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        ref={searchRef}
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

                {filtrando && (
                    <>
                        <span className="text-sm text-muted-foreground tabular-nums">
                            {visible.length} de {cards.length}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setFilter(null)
                                setQuery("")
                            }}
                            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                            Quitar filtros
                        </button>
                    </>
                )}
            </div>

            {lista ? (
                <div className="overflow-y-auto scrollbar-hide">
                    <OrdersTable orders={visible} isAdmin={isAdmin} />
                </div>
            ) : (
                <OrdersBoard cards={visible.filter((c) => c.status !== "cancelado")} />
            )}
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
            <span
                className={`font-display text-2xl font-semibold tabular-nums leading-none ${
                    lit ? "" : "text-foreground"
                }`}
            >
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
            className={`${base} ${value === 0 ? "cursor-default" : "cursor-pointer"} ${
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
