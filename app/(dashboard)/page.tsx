import { Suspense } from "react"
import { StatsCards } from "@/components/stats-cards"

import { LowStockAlerts } from "@/components/low-stock-alerts"
import { RecentMovements } from "@/components/recent-movements"
import { MonthlyMovementsSummary } from "@/components/monthly-movements-summary"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  return (
    <div className="bg-background">
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Estadísticas principales */}
        <Suspense fallback={<div className="h-32 bg-muted animate-pulse rounded-lg" />}>
          <StatsCards />
        </Suspense>

        {/* Resumen de movimientos del mes */}
        <Suspense fallback={<div className="h-32 bg-muted animate-pulse rounded-lg" />}>
          <MonthlyMovementsSummary />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Movimientos recientes */}
          <div className="lg:col-span-3">
            <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
              <RecentMovements />
            </Suspense>
          </div>
        </div>

        {/* Alertas de stock bajo */}
        <Suspense fallback={<div className="h-48 bg-muted animate-pulse rounded-lg" />}>
          <LowStockAlerts />
        </Suspense>
      </main>
    </div>
  )
}
