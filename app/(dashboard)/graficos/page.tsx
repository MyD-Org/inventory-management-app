import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { InventoryCharts } from "@/components/inventory-charts"

export const dynamic = "force-dynamic"

export default async function GraficosPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  // Los gráficos agregan valores y tendencias del inventario: solo admin.
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="bg-background">
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
