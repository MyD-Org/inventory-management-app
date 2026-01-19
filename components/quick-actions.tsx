"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Scan, Plus, Minus, BarChart3, FileText } from "lucide-react"
import { useRouter } from "next/navigation"
import { StockMovementDialog } from "./stock-movement-dialog"

interface Material {
  id: number
  name: string
  barcode: string
  current_stock?: number
  unit_of_measure?: string
}

interface QuickActionsProps {
  materials: Material[]
  userRole?: string
}

export function QuickActions({ materials, userRole }: QuickActionsProps) {
  const router = useRouter()
  const [activeDialog, setActiveDialog] = useState<"entrada" | "salida" | null>(null)

  const actions = [
    {
      title: "Escanear Código",
      description: "Leer código de barras",
      icon: Scan,
      variant: "default" as const,
      onClick: () => {
        router.push("/scan")
      },
      show: true,
    },
    {
      title: "Entrada Stock",
      description: "Registrar ingreso",
      icon: Plus,
      variant: "outline" as const,
      onClick: () => {
        setActiveDialog("entrada")
      },
      show: true,
    },
    {
      title: "Salida Stock",
      description: "Registrar salida",
      icon: Minus,
      variant: "outline" as const,
      onClick: () => {
        setActiveDialog("salida")
      },
      show: true,
    },
    {
      title: "Reportes",
      description: "Ver estadísticas",
      icon: BarChart3,
      variant: "outline" as const,
      onClick: () => {
        router.push("/reports")
      },
      show: userRole === 'admin',
    },
    {
      title: "Nuevo Material",
      description: "Agregar producto",
      icon: FileText,
      variant: "outline" as const,
      onClick: () => {
        router.push("/materials/nuevo")
      },
      show: userRole === 'admin',
    },
    {
      title: "Ver Inventario",
      description: "Lista completa",
      icon: FileText,
      variant: "outline" as const,
      onClick: () => {
        router.push("/inventory")
      },
      show: true,
    },
  ]

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Acciones Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {actions.filter(action => action.show).map((action, index) => (
              <Button
                key={index}
                variant={action.variant}
                className="h-auto p-4 flex flex-col items-center gap-2"
                onClick={action.onClick}
              >
                {action.icon && <action.icon className="w-6 h-6" />}
                <div className="text-center">
                  <div className="text-sm font-medium">{action.title}</div>
                  <div className="text-xs text-muted-foreground">{action.description}</div>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <StockMovementDialog
        type="entrada"
        materials={materials}
        open={activeDialog === "entrada"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />

      <StockMovementDialog
        type="salida"
        materials={materials}
        open={activeDialog === "salida"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
    </>
  )
}
