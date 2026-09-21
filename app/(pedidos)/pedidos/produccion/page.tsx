import { ViewToggle } from "@/components/view-toggle"
import { ProductionView } from "@/components/production-view"
import { AutoRefresh } from "@/components/auto-refresh"
import { productionSummary } from "@/lib/production"
import { parseProductionStatuses } from "@/lib/production-summary"

export const dynamic = "force-dynamic"

// Producción por producto: lo que hay que armar, juntando las líneas de todos los
// pedidos en fabricación. El público es el taller, en la tablet: por eso se arma
// en el server y se refresca sola, como el tablero.
export default async function ProductionPage({
    searchParams,
}: {
    searchParams: { estados?: string }
}) {
    const statuses = parseProductionStatuses(searchParams.estados)
    const summary = await productionSummary(statuses)

    return (
        <div className="w-full px-4 py-6 sm:px-8">
            <AutoRefresh />
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">Pedidos</h1>
                    <p className="text-base text-muted-foreground">
                        Unidades pendientes de fabricación, agrupadas por producto
                    </p>
                </div>
                <ViewToggle vista="produccion" />
            </div>

            <ProductionView summary={summary} statuses={statuses} />
        </div>
    )
}
