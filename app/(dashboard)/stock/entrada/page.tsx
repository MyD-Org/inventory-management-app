import { Suspense } from "react"
import { sql } from "@/lib/database"
import { MovementHistory } from "@/components/movement-history"
import { MovementPageHeaderAction } from "@/components/movement-page-header-action"

export const dynamic = "force-dynamic"

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

export default async function EntradaPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const materials = await getMaterials()

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">Entrada de Stock</h1>
          <p className="text-muted-foreground">Registre y consulte los ingresos de materiales al inventario</p>
        </div>

        <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
          <MovementHistory
            searchParams={searchParams}
            basePath="/stock/entrada"
            forcedType="entrada"
            title="Entradas de Stock"
            headerAction={<MovementPageHeaderAction type="entrada" materials={materials} />}
          />
        </Suspense>
      </main>
    </div>
  )
}
