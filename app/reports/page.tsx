import { Suspense } from "react"
import Link from "next/link"
import { DashboardHeader } from "@/components/dashboard-header"
import { ReportsSummary } from "@/components/reports-summary"
import { InventoryCharts } from "@/components/inventory-charts"
import { MovementHistory } from "@/components/movement-history"

import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const session = await auth()

  if (session?.user?.role !== "admin") {
    redirect("/")
  }

  const section = typeof searchParams?.section === "string" ? searchParams.section : "movements"
  const buildSectionHref = (nextSection: string) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams || {})) {
      if (typeof value === "string") params.set(key, value)
    }
    params.set("section", nextSection)
    return `/reports?${params.toString()}`
  }

  const navItems = [
    { id: "summary", label: "Resumen" },
    { id: "movements", label: "Movimientos" },
    { id: "charts", label: "Gráficos" },
  ]

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={session?.user} hideBackButton />

      <main className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-6 lg:px-8 space-y-6">
        <div className="mb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Reportes y Análisis</h1>
            <p className="text-muted-foreground">Visualice estadísticas y tendencias del inventario</p>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-60">
            <nav className="flex gap-2 lg:flex-col">
              {navItems.map((item) => {
                const isActive = section === item.id
                return (
                  <Link
                    key={item.id}
                    href={buildSectionHref(item.id)}
                    prefetch
                    scroll={false}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </aside>

          <section className="flex-1 space-y-6">
            {section === "summary" && (
              <Suspense fallback={<div className="h-48 bg-muted animate-pulse rounded-lg" />}>
                <ReportsSummary />
              </Suspense>
            )}

            {section === "movements" && (
              <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
                <MovementHistory searchParams={searchParams} />
              </Suspense>
            )}

            {section === "charts" && (
              <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
                <InventoryCharts />
              </Suspense>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
