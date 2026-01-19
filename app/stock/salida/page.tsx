import { StockMovementForm } from "@/components/stock-movement-form"
import { DashboardHeader } from "@/components/dashboard-header"

export default function SalidaPage() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">Salida de Stock</h1>
            <p className="text-muted-foreground">Registre la salida de materiales del inventario</p>
          </div>

          <StockMovementForm movementType="salida" />
        </div>
      </main>
    </div>
  )
}
