"use client"

// Tablero kanban al estilo Linear: columnas sin marco, glifo de estado en el
// encabezado, tarjetas densas y filtros explícitos. El estado se cambia
// ARRASTRANDO la tarjeta; el selector vive en el detalle del pedido.
// Drag & drop con la HTML5 Drag and Drop API nativa, sin dependencias.

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, Loader2, PackageX, TriangleAlert } from "lucide-react"
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
    // Lo mismo para el remito: los dos documentos frenan la salida del pedido.
    alegra_remission_id: string | null
    modified_at: string | null
    delivery_date_verified_at: string | null
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
    const [dragging, setDragging] = useState<number | null>(null)
    const [over, setOver] = useState<string | null>(null)
    // Estado optimista: la tarjeta salta de columna al soltar, sin esperar al server.
    const [moved, setMoved] = useState<Record<number, OrderStatus>>({})
    // Pedidos con una emisión en curso en Alegra, y QUÉ se está emitiendo: se emite
    // solo lo que falta, así que decir "factura y remito" cuando la factura ya
    // estaba es una mentira que se nota —el número está ahí mismo—.
    const [emitiendo, setEmitiendo] = useState<Record<number, string>>({})
    const [refrescando, startRefresh] = useTransition()
    // Sin esto, soltar la tarjeta dispara el click y navega al detalle sin que
    // nadie lo haya pedido.
    const draggedRef = useRef(false)

    // Los datos nuevos ya llegaron: lo que falte ahora falta de verdad.
    useEffect(() => {
        if (!refrescando) setEmitiendo({})
    }, [refrescando])

    const statusOf = (c: BoardCard) => moved[c.id] ?? c.status

    const needsDateReview = (c: BoardCard) =>
        orderNeedsReview({
            modified_at: c.modified_at,
            delivery_date_verified_at: c.delivery_date_verified_at,
        })
    // Mientras Alegra responde no se afirma que falte nada: todavía no se sabe.
    const missingInvoice = (c: BoardCard) =>
        !emitiendo[c.id] && statusOf(c) === "por_facturar" && !c.alegra_invoice_id
    const missingRemission = (c: BoardCard) =>
        !emitiendo[c.id] && statusOf(c) === "por_facturar" && !c.alegra_remission_id
    // La franja roja es una sola: lo que frena la salida es que FALTE un papel,
    // sin importar cuál. Cuál falta lo dicen las etiquetas de la tarjeta.
    const missingDoc = (c: BoardCard) => missingInvoice(c) || missingRemission(c)

    // Las tarjetas llegan filtradas desde OrdersView.
    const visible = cards

    async function move(id: number, status: OrderStatus) {
        if ((cards.find((c) => c.id === id)?.status ?? null) === status) return

        setMoved((m) => ({ ...m, [id]: status }))
        // Mover a esta columna dispara la emisión de la factura y el remito en
        // Alegra: dos llamadas de red que tardan. Sin esto la tarjeta se pintaba
        // "Falta emitir la factura" mientras se estaba emitiendo, que es un error
        // que se desmiente solo un segundo después.
        if (status === "por_facturar") {
            const card = cards.find((c) => c.id === id)
            const falta: string[] = []
            if (!card?.alegra_invoice_id) falta.push("factura")
            if (!card?.alegra_remission_id) falta.push("remito")
            // Sin nada que emitir no se avisa nada: el pedido solo cambia de columna.
            if (falta.length > 0) setEmitiendo((e) => ({ ...e, [id]: falta.join(" y ") }))
        }

        const result = await updateOrderStatus(id, status)
        if (result.error) {
            setMoved((m) => {
                const next = { ...m }
                delete next[id]
                return next
            })
            setEmitiendo((e) => {
                const next = { ...e }
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
        // Dentro de la transición: así el cartel de "emitiendo" se apaga cuando
        // llegan los datos nuevos y no antes. Apagarlo al volver de la acción
        // dejaba una ventana con la tarjeta vieja y el aviso rojo otra vez.
        startRefresh(() => router.refresh())
    }

    return (
        <>
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
                                                missingDoc(card)
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
                                            {emitiendo[card.id] && (
                                                <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    Emitiendo {emitiendo[card.id]}…
                                                </span>
                                            )}

                                            {missingInvoice(card) && (
                                                <span
                                                    className="inline-flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive"
                                                    title="El pedido está para facturar y remitir, pero falta emitir la factura"
                                                >
                                                    <TriangleAlert className="h-3 w-3" />
                                                    Falta emitir la factura
                                                </span>
                                            )}

                                            {missingRemission(card) && (
                                                <span
                                                    className="inline-flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive"
                                                    title="El pedido está para facturar y remitir, pero falta emitir el remito"
                                                >
                                                    <TriangleAlert className="h-3 w-3" />
                                                    Falta emitir el remito
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
