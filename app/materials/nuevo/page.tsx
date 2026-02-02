"use client"

import React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Package, Save, Loader2, Barcode } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Category {
  id: number
  name: string
}

interface Supplier {
  id: number
  name: string
}

export default function NuevoMaterialPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  
  const [formData, setFormData] = useState({
    name: "",
    barcode: "",
    description: "",
    category_id: "",
    supplier_id: "",
    unit_of_measure: "Unidad",
    unit_cost: "",
    min_stock: "10",
    max_stock: "100",
    initial_stock: "0",
  })

  useEffect(() => {
    async function loadData() {
      try {
        const [catRes, supRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/suppliers"),
        ])
        
        if (catRes.ok) {
          const catData = await catRes.json()
          setCategories(catData)
        }
        
        if (supRes.ok) {
          const supData = await supRes.json()
          setSuppliers(supData)
        }
      } catch (error) {
        console.error("Error loading data:", error)
      }
    }
    loadData()
  }, [])

  const generateBarcode = () => {
    const code = Math.floor(10000000 + Math.random() * 90000000).toString()
    setFormData(prev => ({ ...prev, barcode: code }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.category_id || !formData.supplier_id) {
      toast.error("Error", {
        description: "Por favor complete los campos obligatorios",
      })
      return
    }

    setLoading(true)
    
    try {
      const response = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          barcode: formData.barcode || null,
          description: formData.description || null,
          category_id: parseInt(formData.category_id),
          supplier_id: parseInt(formData.supplier_id),
          unit_of_measure: formData.unit_of_measure,
          unit_cost: formData.unit_cost ? parseFloat(formData.unit_cost) : 0,
          min_stock: parseInt(formData.min_stock) || 10,
          max_stock: parseInt(formData.max_stock) || 100,
          initial_stock: parseInt(formData.initial_stock) || 0,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al crear material")
      }

      toast.success("Material creado", {
        description: `${formData.name} se agregó correctamente al inventario`,
      })
      
      // Retrasamos un poco la navegación para evitar que la página se rompa al redirigir
      setTimeout(() => {
        router.push("/")
        router.refresh()
      }, 500)
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "No se pudo crear el material",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 py-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Nuevo Material</CardTitle>
                <CardDescription>Agregar un nuevo producto al inventario</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Nombre del Material *</Label>
                  <Input
                    id="name"
                    placeholder="Ej: LED SMD 5050"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="barcode">Código de Barras</Label>
                  <div className="flex gap-2">
                    <Input
                      id="barcode"
                      placeholder="Escanear o ingresar"
                      value={formData.barcode}
                      onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={generateBarcode} title="Generar código">
                      <Barcode className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit_of_measure">Unidad de Medida</Label>
                  <Select
                    value={formData.unit_of_measure}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, unit_of_measure: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Unidad">Unidad</SelectItem>
                      <SelectItem value="Pieza">Pieza</SelectItem>
                      <SelectItem value="Metro">Metro</SelectItem>
                      <SelectItem value="Kg">Kilogramo</SelectItem>
                      <SelectItem value="Litro">Litro</SelectItem>
                      <SelectItem value="Rollo">Rollo</SelectItem>
                      <SelectItem value="Caja">Caja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category_id">Categoría *</Label>
                  <Select
                    value={formData.category_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplier_id">Proveedor *</Label>
                  <Select
                    value={formData.supplier_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, supplier_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((sup) => (
                        <SelectItem key={sup.id} value={sup.id.toString()}>
                          {sup.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit_cost">Costo Unitario ($)</Label>
                  <Input
                    id="unit_cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.unit_cost}
                    onChange={(e) => setFormData(prev => ({ ...prev, unit_cost: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="initial_stock">Stock Inicial</Label>
                  <Input
                    id="initial_stock"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.initial_stock}
                    onChange={(e) => setFormData(prev => ({ ...prev, initial_stock: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="min_stock">Stock Mínimo</Label>
                  <Input
                    id="min_stock"
                    type="number"
                    min="0"
                    placeholder="10"
                    value={formData.min_stock}
                    onChange={(e) => setFormData(prev => ({ ...prev, min_stock: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_stock">Stock Máximo</Label>
                  <Input
                    id="max_stock"
                    type="number"
                    min="0"
                    placeholder="100"
                    value={formData.max_stock}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_stock: e.target.value }))}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    placeholder="Descripción opcional del material"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Guardar Material
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
