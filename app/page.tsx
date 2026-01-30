import { Suspense } from "react"
import { sql } from "@/lib/database"
import { DashboardHeader } from "@/components/dashboard-header"
import { StatsCards } from "@/components/stats-cards"

export const dynamic = "force-dynamic"

import { LowStockAlerts } from "@/components/low-stock-alerts"
import { RecentMovements } from "@/components/recent-movements"
import { QuickActions } from "@/components/quick-actions"

async function getMaterials() {
  try {
    const materials = await sql`
      SELECT m.id, m.name, m.barcode, i.current_stock, m.unit_of_measure
      FROM materials m
      JOIN inventory i ON m.id = i.material_id
      ORDER BY m.name
    `
    return materials as any[]
  } catch (error) {
    console.error("Error fetching materials:", error)
    return []
  }
}

import { auth } from "@/auth"

export default async function DashboardPage() {
  const materials = await getMaterials()
  const session = await auth()

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={session?.user} />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Estadísticas principales */}
        <Suspense fallback={<div className="h-32 bg-muted animate-pulse rounded-lg" />}>
          <StatsCards />
        </Suspense>

        {/* Acciones rápidas */}
        <QuickActions materials={materials} userRole={session?.user?.role} />

        {/* Alertas de stock bajo */}
        <Suspense fallback={<div className="h-48 bg-muted animate-pulse rounded-lg" />}>
          <LowStockAlerts />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Movimientos recientes */}
          <div className="lg:col-span-3">
            <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
              <RecentMovements />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
}
