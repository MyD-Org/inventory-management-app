// Vista de producción por producto. Server Component a propósito: los filtros son
// links y el desplegable es un <details>. Lo único con estado es la ventana de
// detalle de una combinación, que vive en components/production-combos.tsx.

import Link from "next/link"
import { ChevronRight, TriangleAlert } from "lucide-react"
import { StatusIcon } from "@/components/order-glyphs"
import { ProductionCombos } from "@/components/production-combos"
import { formatStock } from "@/lib/format"
import { formatDate, isOverdue } from "@/lib/order-dates"
import { STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"
import {
    DEFAULT_PRODUCTION_STATUSES,
    PRODUCTION_STATUSES,
    type ProductionGroup,
    type ProductionSummary,
} from "@/lib/production-summary"

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

// Prender o apagar un estado es un link a la misma página con otro `estados`.
// Con los de por defecto la URL queda limpia, sin parámetro.
function hrefFor(statuses: OrderStatus[]): string {
    const ordenados = PRODUCTION_STATUSES.filter((s) => statuses.includes(s))
    const esDefault =
        ordenados.length === DEFAULT_PRODUCTION_STATUSES.length &&
        ordenados.every((s) => DEFAULT_PRODUCTION_STATUSES.includes(s))
    return esDefault ? "/pedidos/produccion" : `/pedidos/produccion?estados=${ordenados.join(",")}`
}

function StatusFilter({ statuses }: { statuses: OrderStatus[] }) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            {PRODUCTION_STATUSES.map((s) => {
                const on = statuses.includes(s)
                // El último prendido no se apaga: sin estados la vista no muestra nada
                // y parseProductionStatuses volvería a los de por defecto igual.
                const next = on ? statuses.filter((x) => x !== s) : [...statuses, s]
                const clase = `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-base transition-colors ${
                    on ? "bg-foreground text-background border-foreground" : "text-muted-foreground hover:text-foreground"
                }`
                const contenido = (
                    <>
                        <StatusIcon status={s} className={on ? "text-background" : ""} />
                        {STATUS_LABELS[s]}
                    </>
                )
                return next.length === 0 ? (
                    <span key={s} className={clase} aria-current="true">
                        {contenido}
                    </span>
                ) : (
                    <Link key={s} href={hrefFor(next)} className={clase} aria-pressed={on}>
                        {contenido}
                    </Link>
                )
            })}
        </div>
    )
}

function Desplegable({ titulo, open, children }: { titulo: string; open?: boolean; children: React.ReactNode }) {
    return (
        <details open={open} className="group mt-4">
            <summary className="flex items-center gap-1.5 cursor-pointer select-none list-none text-base font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                {titulo}
            </summary>
            <div className="mt-2">{children}</div>
        </details>
    )
}

function GroupHeader({ titulo, units, orders, children }: { titulo: React.ReactNode; units: number; orders: number; children?: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h2 className="font-display text-xl font-semibold leading-tight">{titulo}</h2>
            <p className="text-base text-muted-foreground">
                <span className="font-mono tabular-nums text-2xl font-semibold text-foreground">{formatStock(units)}</span>{" "}
                u. · {orders} {plural(orders, "pedido", "pedidos")}
                {children}
            </p>
        </div>
    )
}

function ProductCard({ group }: { group: ProductionGroup }) {
    const vencido = group.lines.some((l) => isOverdue(l.delivery_date_estimate, l.status))
    return (
        <section className="rounded-lg border bg-card p-4 sm:p-5">
            <GroupHeader
                titulo={
                    <span className="inline-flex items-center gap-2 flex-wrap">
                        {group.product}
                        {group.budget_id === null && (
                            <span
                                className="inline-flex items-center gap-1 rounded-full border border-amber-500/60 px-2 py-0.5 font-sans text-xs font-medium text-amber-600 dark:text-amber-400"
                                title="Producto sin hoja de costo: sin receta ni descuento de stock"
                            >
                                <TriangleAlert className="h-3 w-3" />
                                Sin ficha
                            </span>
                        )}
                    </span>
                }
                units={group.units}
                orders={group.orders}
            >
                {group.nextDelivery && (
                    <span className={vencido ? "text-destructive font-medium" : ""}>
                        {" "}
                        · próxima entrega {formatDate(group.nextDelivery)}
                    </span>
                )}
            </GroupHeader>

            {group.fields.length > 0 && (
                <Desplegable titulo="Combinaciones pendientes" open>
                    <ProductionCombos product={group.product} fields={group.fields} combos={group.combos} />
                </Desplegable>
            )}
        </section>
    )
}

export function ProductionView({ summary, statuses }: { summary: ProductionSummary; statuses: OrderStatus[] }) {
    const vacio = summary.groups.length === 0
    return (
        <div className="space-y-4 pb-24">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <StatusFilter statuses={statuses} />
                {!vacio && (
                    <p className="text-base text-muted-foreground">
                        <span className="font-mono tabular-nums font-medium text-foreground">{formatStock(summary.units)}</span>{" "}
                        u. pendientes en {summary.orders} {plural(summary.orders, "pedido", "pedidos")}
                    </p>
                )}
            </div>

            {vacio && (
                <p className="text-base text-muted-foreground py-12 text-center">
                    Sin unidades pendientes en {statuses.map((s) => `"${STATUS_LABELS[s]}"`).join(", ")}.
                </p>
            )}

            {summary.groups.map((g) => (
                <ProductCard key={g.key} group={g} />
            ))}
        </div>
    )
}
