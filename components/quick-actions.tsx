"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Scan, Plus, Minus, BarChart3, FileText } from "lucide-react"
import { useRouter } from "next/navigation"

export function QuickActions() {
  const router = useRouter()

  const actions = [
    {
      title: "Escanear Código",
      description: "Leer código de barras",
      icon: Scan,
      variant: "default" as const,
      onClick: () => {
        router.push("/scan")
      },
    },
    {
      title: "Entrada Stock",
      description: "Registrar ingreso",
      icon: Plus,
      variant: "outline" as const,
      onClick: () => {
        router.push("/stock/entrada")
      },
    },
    {
      title: "Salida Stock",
      description: "Registrar salida",
      icon: Minus,
      variant: "outline" as const,
      onClick: () => {
        router.push("/stock/salida")
      },
    },
    {
      title: "Reportes",
      description: "Ver estadísticas",
      icon: BarChart3,
      variant: "outline" as const,
      onClick: () => {
        router.push("/reports")
      },
    },
    {
      title: "Nuevo Material",
      description: "Agregar producto",
      icon: FileText,
      variant: "outline" as const,
      onClick: () => {
        router.push("/materials/nuevo")
      },
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Acciones Rápidas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {actions.map((action, index) => (
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
  )
}
