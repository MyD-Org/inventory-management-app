"use client"

// Glifos de estado y prioridad al estilo Linear: un círculo que se va llenando
// a medida que el pedido avanza, y barras para la prioridad. Se leen de un
// vistazo en una tarjeta chica, mucho mejor que un texto o un badge de color.

import type { OrderStatus } from "@/lib/order-statuses"

// Cuánto del círculo está lleno por estado, y de qué color.
const STATUS_STYLE: Record<OrderStatus, { progress: number; className: string }> = {
    por_revisar: { progress: 0, className: "text-muted-foreground" },
    recibido: { progress: 0, className: "text-sky-500" },
    en_proceso: { progress: 0.35, className: "text-amber-500" },
    embalado: { progress: 0.6, className: "text-amber-500" },
    facturado: { progress: 0.8, className: "text-violet-500" },
    listo_para_retirar: { progress: 1, className: "text-emerald-500" },
    retirado: { progress: 1, className: "text-emerald-600" },
    cancelado: { progress: 0, className: "text-muted-foreground" },
}

export function StatusIcon({ status, className = "" }: { status: OrderStatus; className?: string }) {
    const { progress, className: color } = STATUS_STYLE[status]
    const r = 5
    const c = 2 * Math.PI * r

    return (
        <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 ${color} ${className}`} aria-hidden>
            <circle
                cx="8" cy="8" r={r}
                fill="none" stroke="currentColor" strokeWidth="1.5"
                // 'Por revisar' es el backlog: círculo punteado, todavía no entró al flujo.
                strokeDasharray={status === "por_revisar" ? "2 2" : undefined}
                opacity={status === "cancelado" ? 0.5 : 1}
            />
            {/* El relleno se dibuja como un arco grueso desde arriba, en sentido horario */}
            {progress > 0 && progress < 1 && (
                <circle
                    cx="8" cy="8" r={r / 2}
                    fill="none" stroke="currentColor" strokeWidth={r}
                    strokeDasharray={`${(c / 2) * progress} ${c}`}
                    transform="rotate(-90 8 8)"
                />
            )}
            {progress === 1 && (
                <>
                    <circle cx="8" cy="8" r={r} fill="currentColor" />
                    <path
                        d="M5.5 8.2l1.8 1.8 3.2-3.6"
                        fill="none" stroke="white" strokeWidth="1.6"
                        strokeLinecap="round" strokeLinejoin="round"
                    />
                </>
            )}
            {status === "cancelado" && (
                <path
                    d="M5.5 5.5l5 5M10.5 5.5l-5 5"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                    opacity="0.7"
                />
            )}
        </svg>
    )
}

// Prioridad: tres barras que se llenan. 'alta' además va en naranja, como el
// urgente de Linear.
export function PriorityIcon({ priority, className = "" }: { priority: string; className?: string }) {
    const filled = priority === "alta" ? 3 : priority === "normal" ? 2 : 1
    const color = priority === "alta" ? "text-orange-500" : "text-muted-foreground"

    return (
        <svg
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 shrink-0 ${color} ${className}`}
            aria-label={`Prioridad ${priority}`}
        >
            {[0, 1, 2].map((i) => (
                <rect
                    key={i}
                    x={2 + i * 4.5} y={11 - i * 3}
                    width="3" height={2 + i * 3}
                    rx="1"
                    fill="currentColor"
                    opacity={i < filled ? 1 : 0.25}
                />
            ))}
        </svg>
    )
}
