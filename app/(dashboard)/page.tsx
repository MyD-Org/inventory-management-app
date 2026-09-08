import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { OperatorStockActions } from "@/components/operator-stock-actions"
import { OperatorWeekMovements } from "@/components/operator-week-movements"
import { StatsCards } from "@/components/stats-cards"

import { LowStockAlerts } from "@/components/low-stock-alerts"
import { RecentMovements } from "@/components/recent-movements"
import { MonthlyMovementsSummary } from "@/components/monthly-movements-summary"

export const dynamic = "force-dynamic"

// Sin unit_cost a propósito: esta lista viaja al navegador del operador y el
// costo se vería abriendo la consola, aunque el campo no esté en el formulario.
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

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  // El operador tiene su propio inicio: los dos botones de stock (que abren el
  // modal) y los movimientos de la semana. Nada de stats, resumen del mes ni
  // alertas.
  if (session.user.role !== "admin") {
    const materials = await getMaterials()
    // Mismo criterio que la API de movimientos: el nombre es la identidad que
    // queda grabada en stock_movements.user_name.
    const userName = session.user.name || session.user.email || "Desconocido"

    return (
      <div className="bg-background">
        {/* Ancho completo, no una columna angosta centrada: los botones van en
            una fila arriba y los movimientos abajo ocupan todo el ancho, que es
            donde el listado se lee cómodo. */}
        <main className="container mx-auto px-4 py-6 space-y-8">
          <OperatorStockActions materials={materials} />

          <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
            <OperatorWeekMovements userName={userName} />
          </Suspense>
        </main>
      </div>
    )
  }

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
