import { Suspense } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { StatsCards } from "@/components/stats-cards"
import { InventoryTable } from "@/components/inventory-table"
import { LowStockAlerts } from "@/components/low-stock-alerts"
import { RecentMovements } from "@/components/recent-movements"
import { QuickActions } from "@/components/quick-actions"

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Estadísticas principales */}
        <Suspense fallback={<div className="h-32 bg-muted animate-pulse rounded-lg" />}>
          <StatsCards />
        </Suspense>

        {/* Acciones rápidas */}
        <QuickActions />

        {/* Alertas de stock bajo */}
        <Suspense fallback={<div className="h-48 bg-muted animate-pulse rounded-lg" />}>
          <LowStockAlerts />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tabla de inventario principal */}
          <div className="lg:col-span-2">
            <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
              <InventoryTable />
            </Suspense>
          </div>

          {/* Movimientos recientes */}
          <div className="lg:col-span-1">
            <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
              <RecentMovements />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
}
