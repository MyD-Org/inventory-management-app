"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Package, AlertTriangle, CheckCircle, Scan } from "lucide-react"
import { BarcodeScanner } from "./barcode-scanner"

interface Material {
  id: number
  name: string
  barcode: string
  description?: string
  unit_of_measure: string
  current_stock: number
  available_stock: number
  min_stock: number
  category_name?: string
  supplier_name?: string
}

interface MaterialLookupProps {
  onMaterialFound?: (material: Material) => void
}

export function MaterialLookup({ onMaterialFound }: MaterialLookupProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [material, setMaterial] = useState<Material | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookupMaterial = async (barcode: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/materials/lookup?barcode=${encodeURIComponent(barcode)}`)

      if (!response.ok) {
        throw new Error("Material no encontrado")
      }

      const foundMaterial = await response.json()
      setMaterial(foundMaterial)
      onMaterialFound?.(foundMaterial)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al buscar material")
      setMaterial(null)
    } finally {
      setLoading(false)
    }
  }

  const handleScan = (barcode: string) => {
    lookupMaterial(barcode)
    setIsScanning(false)
  }

  const getStockStatus = (current: number, min: number) => {
    if (current <= min) return { status: "low", color: "destructive", text: "Stock Bajo" } as const
    if (current <= min * 1.5) return { status: "warning", color: "secondary", text: "Stock Medio" } as const
    return { status: "good", color: "default", text: "Stock Normal" } as const
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Consulta de Material
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setIsScanning(true)} className="w-full" disabled={loading}>
            <Scan className="w-4 h-4 mr-2" />
            {loading ? "Buscando..." : "Escanear Código de Barras"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {material && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-100">
              <CheckCircle className="w-5 h-5" />
              Material Encontrado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg text-foreground">{material.name}</h3>
              <p className="text-sm text-muted-foreground">{material.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Código de Barras</label>
                <p className="font-mono text-sm">{material.barcode}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Categoría</label>
                <p className="text-sm">{material.category_name || "Sin categoría"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Proveedor</label>
                <p className="text-sm">{material.supplier_name || "Sin proveedor"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Unidad</label>
                <p className="text-sm">{material.unit_of_measure}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Stock Actual</span>
                <Badge variant={getStockStatus(material.current_stock, material.min_stock).color}>
                  {getStockStatus(material.current_stock, material.min_stock).text}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{material.current_stock}</div>
                  <div className="text-muted-foreground">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{material.available_stock}</div>
                  <div className="text-muted-foreground">Disponible</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{material.min_stock}</div>
                  <div className="text-muted-foreground">Mínimo</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <BarcodeScanner
        isOpen={isScanning}
        onClose={() => setIsScanning(false)}
        onScan={handleScan}
        title="Buscar Material"
      />
    </div>
  )
}
