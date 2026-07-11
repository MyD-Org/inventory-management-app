import { StockMovementForm } from "@/components/stock-movement-form"

export default function AjustePage() {
  return (
    <div className="bg-background">
      <main className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">Ajuste de Stock</h1>
            <p className="text-muted-foreground">Corrija diferencias en el inventario</p>
          </div>

          <StockMovementForm movementType="ajuste" />
        </div>
      </main>
    </div>
  )
}
