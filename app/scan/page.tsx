import { MaterialLookup } from "@/components/material-lookup"
import { DashboardHeader } from "@/components/dashboard-header"

export default function ScanPage() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">Escáner de Códigos de Barras</h1>
            <p className="text-muted-foreground">
              Escanee o ingrese un código de barras para consultar información del material
            </p>
          </div>

          <MaterialLookup />
        </div>
      </main>
    </div>
  )
}
