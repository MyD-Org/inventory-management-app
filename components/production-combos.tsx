"use client"

// Las combinaciones de un producto y, al tocar una, la ventana con los pedidos de
// los que sale. Es el único pedazo de la vista de producción que necesita estado
// (qué combinación está abierta); el resto se arma en el server.
//
// Solo importa módulos sin base de datos: ver lib/order-statuses.ts.

import { useState } from "react"
import Link from "next/link"
import { CalendarClock, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StatusIcon } from "@/components/order-glyphs"
import { formatStock } from "@/lib/format"
import { formatDate, isOverdue } from "@/lib/order-dates"
import { STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"
import { SIN_ESPECIFICAR, type ProductionCombo, type ProductionField } from "@/lib/production-summary"

/** Las variaciones que la combinación SÍ tiene cargadas, con su nombre. */
function cargadas(combo: ProductionCombo, fields: ProductionField[]) {
    return fields
        .map((f, i) => ({ key: f.key, label: f.label, value: combo.values[i] }))
        .filter((x) => x.value !== SIN_ESPECIFICAR)
}

export function ProductionCombos({
    product,
    fields,
    combos,
}: {
    product: string
    fields: ProductionField[]
    combos: ProductionCombo[]
}) {
    const [abierta, setAbierta] = useState<ProductionCombo | null>(null)

    return (
        <>
            {/* Celular: una tabla de seis columnas no entra. Cada combinación es un
                renglón con la cantidad y solo lo que tiene cargado. */}
            <div className="md:hidden rounded-md border divide-y">
                {combos.map((c) => {
                    const datos = cargadas(c, fields)
                    return (
                        <button
                            key={c.values.join("|")}
                            type="button"
                            onClick={() => setAbierta(c)}
                            className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 outline-none"
                        >
                            <span className="w-14 shrink-0 text-right font-mono tabular-nums text-lg font-semibold">
                                {formatStock(c.units)}
                            </span>
                            <span className="min-w-0 flex-1 text-base">
                                {datos.length === 0 ? (
                                    <span className="text-muted-foreground">Sin variaciones</span>
                                ) : (
                                    datos.map((d) => (
                                        <span key={d.key} className="block">
                                            <span className="text-sm text-muted-foreground">{d.label}: </span>
                                            {d.value}
                                        </span>
                                    ))
                                )}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                    )
                })}
            </div>

            {/* Tablet y escritorio: las mismas columnas que la tabla de un pedido. */}
            <div className="hidden md:block overflow-x-auto rounded-md border">
                <table className="w-full text-base">
                    <thead>
                        <tr className="border-b text-left text-sm text-muted-foreground">
                            <th className="px-3 py-2 font-medium text-right w-24">Cant.</th>
                            {fields.map((f) => (
                                <th key={f.key} className="px-3 py-2 font-medium">
                                    {f.label}
                                </th>
                            ))}
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {combos.map((c) => (
                            <tr
                                key={c.values.join("|")}
                                role="button"
                                tabIndex={0}
                                onClick={() => setAbierta(c)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault()
                                        setAbierta(c)
                                    }
                                }}
                                className="cursor-pointer hover:bg-muted/50 outline-none focus-visible:bg-muted/50"
                            >
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-lg font-semibold">
                                    {formatStock(c.units)}
                                </td>
                                {c.values.map((v, i) => (
                                    <td key={fields[i].key} className="px-3 py-2.5">
                                        {/* Un guion se lee mejor que la frase repetida en media grilla. */}
                                        {v === SIN_ESPECIFICAR ? (
                                            <span className="text-muted-foreground" title={SIN_ESPECIFICAR}>
                                                —
                                            </span>
                                        ) : (
                                            v
                                        )}
                                    </td>
                                ))}
                                <td className="pr-3 text-muted-foreground">
                                    <ChevronRight className="h-4 w-4" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog open={abierta !== null} onOpenChange={(open) => !open && setAbierta(null)}>
                {abierta && (
                    <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl">
                                {formatStock(abierta.units)} u. de {product}
                            </DialogTitle>
                            <DialogDescription asChild>
                                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 pt-1 text-left text-base">
                                    {cargadas(abierta, fields).map((d) => (
                                        <div key={d.key} className="contents">
                                            <dt className="text-muted-foreground">{d.label}</dt>
                                            <dd className="text-foreground">{d.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </DialogDescription>
                        </DialogHeader>

                        <div>
                            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                                {abierta.lines.length === 1
                                    ? "Pedido de origen"
                                    : `Pedidos de origen (${abierta.lines.length}), por fecha de entrega`}
                            </h3>
                            <div className="rounded-md border divide-y">
                                {abierta.lines.map((l, i) => {
                                    const status = l.status as OrderStatus
                                    const overdue = isOverdue(l.delivery_date_estimate, l.status)
                                    return (
                                        <Link
                                            key={`${l.order_id}-${i}`}
                                            href={`/pedidos/${l.order_id}`}
                                            className="flex items-center gap-3 px-3 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 outline-none"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-medium truncate">
                                                    <span className="font-mono text-sm text-muted-foreground tabular-nums">
                                                        #{l.order_number}
                                                    </span>{" "}
                                                    {l.customer_name}
                                                </span>
                                                <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <StatusIcon status={status} />
                                                        {STATUS_LABELS[status] ?? l.status}
                                                    </span>
                                                    <span
                                                        className={`inline-flex items-center gap-1 ${overdue ? "text-destructive font-medium" : ""}`}
                                                    >
                                                        <CalendarClock className="h-3.5 w-3.5" />
                                                        {l.delivery_date_estimate
                                                            ? `Entrega ${formatDate(l.delivery_date_estimate)}${overdue ? " · vencida" : ""}`
                                                            : "Sin fecha de entrega"}
                                                    </span>
                                                </span>
                                            </span>
                                            <span className="shrink-0 font-mono tabular-nums text-lg font-semibold">
                                                {formatStock(l.units)} u.
                                            </span>
                                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    </DialogContent>
                )}
            </Dialog>
        </>
    )
}
