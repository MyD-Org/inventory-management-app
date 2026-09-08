"use client"

import { useMemo, useState } from "react"
import { TrendingDown, TrendingUp } from "lucide-react"
import { UndoMovementButton } from "@/components/undo-movement-button"
import { formatStock } from "@/lib/format"
import { TZ, type MovimientoDeLaSemana } from "@/lib/operator-movements"  // módulo puro: no arrastra lib/database al cliente

const FILTROS = [
    { id: "propios", label: "Propios" },
    { id: "todos", label: "Todos" },
] as const

type Filtro = (typeof FILTROS)[number]["id"]

function formatearFecha(iso: string) {
    // Día abreviado + hora en 24 h: la semana entra en una sola línea corta
    // ("mié 14:20") sin repetir el mes, que en siete días no aporta nada.
    const d = new Date(iso)
    const dia = d.toLocaleDateString("es-AR", { weekday: "short", timeZone: TZ })
    const hora = d.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TZ,
    })
    return `${dia} ${hora}`
}

export function OperatorMovementsList({ movimientos }: { movimientos: MovimientoDeLaSemana[] }) {
    // Arranca en "Propios": lo primero que se busca acá es el control del
    // trabajo propio. Los de los demás quedan a un clic para el otro caso real,
    // que es "falta stock, ¿quién lo sacó?".
    const [filtro, setFiltro] = useState<Filtro>("propios")

    const visibles = useMemo(
        () => (filtro === "propios" ? movimientos.filter((m) => m.mine) : movimientos),
        [filtro, movimientos],
    )

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">Movimientos de la semana</h2>

                <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Filtrar movimientos">
                    {FILTROS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setFiltro(f.id)}
                            aria-pressed={filtro === f.id}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                filtro === f.id
                                    ? "bg-secondary text-secondary-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {visibles.length === 0 ? (
                <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                    {filtro === "propios"
                        ? "No hay movimientos propios registrados esta semana."
                        : "No hay movimientos registrados esta semana."}
                </p>
            ) : (
                <div className="space-y-2">
                    {visibles.map((mov) => {
                        const esEntrada = mov.movement_type === "entrada"
                        const Icon = esEntrada ? TrendingUp : TrendingDown

                        return (
                            <div
                                key={mov.id}
                                className="flex items-center gap-3 rounded-lg border bg-card p-3"
                            >
                                <Icon
                                    className={`h-5 w-5 shrink-0 ${esEntrada ? "text-muted-foreground" : "text-destructive"}`}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium text-foreground">{mov.material_name}</div>
                                    <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                                        <span className="font-mono tabular-nums">{formatearFecha(mov.created_at)}</span>
                                        {/* El responsable solo cuando no es propio: en la vista
                                            de propios la columna repetiría el mismo nombre en
                                            todas las filas. */}
                                        {!mov.mine && (
                                            <>
                                                <span aria-hidden>·</span>
                                                <span className="truncate">{mov.user_name || "Sistema"}</span>
                                            </>
                                        )}
                                        {mov.undoable && (
                                            <>
                                                <span aria-hidden>·</span>
                                                <UndoMovementButton movementId={mov.id} />
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div
                                    className={`shrink-0 font-mono text-sm font-medium tabular-nums ${
                                        esEntrada ? "text-foreground" : "text-destructive"
                                    }`}
                                >
                                    {esEntrada ? "+" : "−"}
                                    {formatStock(Math.abs(Number(mov.quantity)))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
