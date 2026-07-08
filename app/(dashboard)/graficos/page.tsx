import { Suspense } from "react"
import { InventoryCharts } from "@/components/inventory-charts"

export const dynamic = "force-dynamic"

export default function GraficosPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Gráficos</h1>
          <p className="text-muted-foreground">Estadísticas y tendencias del inventario</p>
        </div>

        <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
          <InventoryCharts />
        </Suspense>
      </main>
    </div>
  )
}
