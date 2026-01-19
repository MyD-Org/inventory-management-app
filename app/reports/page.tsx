import { Suspense } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { ReportsSummary } from "@/components/reports-summary"
import { InventoryCharts } from "@/components/inventory-charts"
import { MovementHistory } from "@/components/movement-history"

import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function ReportsPage() {
  const session = await auth()

  if (session?.user?.role !== 'admin') {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={session?.user} />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">Reportes y Análisis</h1>
          <p className="text-muted-foreground">Visualice estadísticas y tendencias del inventario</p>
        </div>

        {/* Resumen ejecutivo */}
        <Suspense fallback={<div className="h-48 bg-muted animate-pulse rounded-lg" />}>
          <ReportsSummary />
        </Suspense>

        {/* Gráficos y visualizaciones */}
        <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
          <InventoryCharts />
        </Suspense>

        {/* Historial de movimientos */}
        <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
          <MovementHistory />
        </Suspense>
      </main>
    </div>
  )
}
