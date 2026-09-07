import { TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UndoMovementButton } from "@/components/undo-movement-button"
import { formatStock } from "@/lib/format"
import { TZ, listarMovimientosDeHoy } from "@/lib/operator-movements"

// "Lo que hiciste hoy": reemplaza a RecentMovements en el inicio del operador.
// La lista general mezclaba los movimientos de todo el mundo, y con los ajenos
// no puede hacer nada —ni entrar al material, que es admin-only—. Filtrada a
// él y al día sirve para lo que sí necesita: chequear si ya cargó algo y
// deshacerlo si se equivocó.
export async function OperatorTodayMovements({ userName }: { userName: string }) {
    const movimientos = await listarMovimientosDeHoy(userName)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Lo que hiciste hoy</CardTitle>
            </CardHeader>
            <CardContent>
                {movimientos.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        Todavía no cargaste ni quitaste nada hoy.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {movimientos.map((mov) => {
                            const esEntrada = mov.movement_type === "entrada"
                            const Icon = esEntrada ? TrendingUp : TrendingDown

                            return (
                                <div key={mov.id} className="flex items-center gap-3 rounded-lg bg-muted p-3">
                                    <Icon
                                        className={`h-5 w-5 shrink-0 ${esEntrada ? "text-muted-foreground" : "text-destructive"}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium text-foreground">{mov.material_name}</div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span className="font-mono tabular-nums">
                                                {/* hour12 en false: con el default de es-AR salía
                                                    "05:06 p. m.", que es más largo y se lee peor de
                                                    un vistazo que "17:06". */}
                                                {new Date(mov.created_at).toLocaleTimeString("es-AR", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: false,
                                                    timeZone: TZ,
                                                })}
                                            </span>
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
            </CardContent>
        </Card>
    )
}
