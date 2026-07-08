"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Minus, RotateCcw, Scan, AlertTriangle, CheckCircle } from "lucide-react"
import { BarcodeScanner } from "./barcode-scanner"
import { useToast } from "@/hooks/use-toast"

interface Material {
  id: number
  name: string
  barcode: string
  unit_of_measure: string
  current_stock: number
  available_stock: number
  min_stock: number
  max_stock: number
}

interface StockMovementFormProps {
  movementType: "entrada" | "salida" | "ajuste"
}

export function StockMovementForm({ movementType }: StockMovementFormProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [material, setMaterial] = useState<Material | null>(null)
  const [quantity, setQuantity] = useState("")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const movementConfig = {
    entrada: {
      title: "Entrada de Stock",
      icon: Plus,
      color: "text-green-600",
      bgColor: "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
      description: "Registrar ingreso de materiales al inventario",
    },
    salida: {
      title: "Salida de Stock",
      icon: Minus,
      color: "text-red-600",
      bgColor: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
      description: "Registrar salida de materiales del inventario",
    },
    ajuste: {
      title: "Ajuste de Stock",
      icon: RotateCcw,
      color: "text-blue-600",
      bgColor: "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
      description: "Corregir diferencias en el inventario",
    },
  }

  const config = movementConfig[movementType]

  const lookupMaterial = async (barcode: string) => {
    try {
      const response = await fetch(`/api/materials/lookup?barcode=${encodeURIComponent(barcode)}`)

      if (!response.ok) {
        throw new Error("Material no encontrado")
      }

      const foundMaterial = await response.json()
      setMaterial(foundMaterial)
    } catch (error) {
      toast.error("Error", {
        description: "Material no encontrado en el sistema",
      })
    }
  }

  const handleScan = (barcode: string) => {
    lookupMaterial(barcode)
    setIsScanning(false)
  }

  const validateMovement = () => {
    if (!material) {
      toast.error("Falta el material", {
        description: "Seleccioná un material antes de confirmar.",
      })
      return false
    }

    const qty = Number.parseInt(quantity)
    if (!qty || qty <= 0) {
      toast.error("Falta la cantidad", {
        description: "La cantidad debe ser mayor a 0.",
      })
      return false
    }

    if (movementType === "salida" && qty > material.available_stock) {
      toast.error("Error", {
        description: `Stock insuficiente. Disponible: ${material.available_stock}`,
      })
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateMovement()) return

    setLoading(true)

    try {
      const response = await fetch("/api/stock/movement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          material_id: material!.id,
          movement_type: movementType,
          quantity: movementType === "salida" ? -Number.parseInt(quantity) : Number.parseInt(quantity),
          reference_number: referenceNumber || null,
          notes: notes || null,
          // El usuario se toma de la sesión en el servidor (ver /api/stock/movement)
        }),
      })

      if (!response.ok) {
        throw new Error("Error al registrar el movimiento")
      }

      const result = await response.json()

      setSuccess(true)
      toast.success("Éxito", {
        description: `Movimiento registrado correctamente. Nuevo stock: ${result.new_stock}`,
      })

      // Refrescar los datos en el cliente para que se vean reflejados en todas las tablas
      router.refresh()

      // Limpiar formulario
      setTimeout(() => {
        setMaterial(null)
        setQuantity("")
        setReferenceNumber("")
        setNotes("")
        setSuccess(false)
      }, 2000)
    } catch (error) {
      toast.error("Error", {
        description: "No se pudo registrar el movimiento",
      })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setMaterial(null)
    setQuantity("")
    setReferenceNumber("")
    setNotes("")
    setSuccess(false)
  }

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-green-800 dark:text-green-100">Movimiento Registrado</h3>
              <p className="text-green-600 dark:text-green-200">El {movementType} se registró correctamente</p>
            </div>
            <Button onClick={resetForm} variant="outline">
              Registrar Otro Movimiento
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className={config.bgColor}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${config.color}`}>
            <config.icon className="w-5 h-5" />
            {config.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </CardHeader>
      </Card>

      {/* Selección de Material */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Seleccionar Material</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!material ? (
            <Button onClick={() => setIsScanning(true)} className="w-full">
              <Scan className="w-4 h-4 mr-2" />
              Escanear Código de Barras
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <h3 className="font-semibold">{material.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{material.barcode}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setMaterial(null)}>
                  Cambiar
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Stock Actual</Label>
                  <p className="font-semibold">
                    {material.current_stock} {material.unit_of_measure}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Disponible</Label>
                  <p className="font-semibold">
                    {material.available_stock} {material.unit_of_measure}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulario de Movimiento */}
      {material && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. Detalles del Movimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="quantity">Cantidad ({material.unit_of_measure}) *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Ingrese la cantidad"
                  required
                />
                {movementType === "salida" && material && (
                  <p className="text-xs text-muted-foreground mt-1">Máximo disponible: {material.available_stock}</p>
                )}
              </div>

              <div>
                <Label htmlFor="referenceNumber">Número de Referencia</Label>
                <Input
                  id="referenceNumber"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Ej: Orden #123, Factura #456"
                />
              </div>

              <div>
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones adicionales..."
                  rows={3}
                />
              </div>

              {/* Validaciones visuales */}
              {quantity &&
                material &&
                movementType === "salida" &&
                Number.parseInt(quantity) > material.available_stock && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950 dark:border-red-800">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span className="text-sm text-red-600 dark:text-red-400">
                      Stock insuficiente. Disponible: {material.available_stock} {material.unit_of_measure}
                    </span>
                  </div>
                )}

              <div className="flex gap-3 pt-4">
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? "Procesando..." : `Registrar ${config.title}`}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Limpiar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <BarcodeScanner
        isOpen={isScanning}
        onClose={() => setIsScanning(false)}
        onScan={handleScan}
        title={`Seleccionar Material - ${config.title}`}
      />
    </div>
  )
}
