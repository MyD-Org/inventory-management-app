import { Suspense } from "react"
import { MovementHistory } from "@/components/movement-history"

export const dynamic = "force-dynamic"

export default function MovimientosPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Movimientos</h1>
          <p className="text-muted-foreground">Historial de entradas, salidas y ajustes de stock</p>
        </div>

        <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
          <MovementHistory searchParams={searchParams} basePath="/movimientos" />
        </Suspense>
      </main>
    </div>
  )
}
