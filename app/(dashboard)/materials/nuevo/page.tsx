"use client"

import React from "react"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Package, Save, Loader2, ChevronRight, Home } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { MaterialFormFields } from "@/components/material-form-fields"

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
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [optionsError, setOptionsError] = useState(false)
  
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

  // Si la carga falla (el server recompilando, la red cortada) el form se
  // quedaba vacío para siempre y sin avisar. Se reintenta solo, con esperas
  // crecientes: el usuario no tiene por qué apretar nada.
  const loadOptions = useCallback(async () => {
    const esperas = [800, 2000, 4000] // 4 intentos en total

    setLoadingOptions(true)
    setOptionsError(false)

    for (let intento = 0; ; intento++) {
      try {
        const [catRes, supRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/suppliers"),
        ])

        if (!catRes.ok || !supRes.ok) {
          const detail = await catRes.clone().json().catch(() => null)
          throw new Error(detail?.detail || detail?.error || "Respuesta no OK")
        }

        setCategories(await catRes.json())
        setSuppliers(await supRes.json())
        setLoadingOptions(false)
        return
      } catch (error) {
        console.error("Error loading data:", error)

        if (intento >= esperas.length) {
          // Se agotaron los reintentos: recién acá se le dice algo al usuario.
          setOptionsError(true)
          setLoadingOptions(false)
          return
        }

        // Sigue en "Cargando...": mostrar el estado vacío entre intentos
        // haría parpadear un aviso falso.
        await new Promise((r) => setTimeout(r, esperas[intento]))
      }
    }
  }, [])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  const [generatingBarcode, setGeneratingBarcode] = useState(false)

  const generateBarcode = async () => {
    setGeneratingBarcode(true)
    try {
      const res = await fetch("/api/materials/generate-barcode")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al generar el código")
      setFormData(prev => ({ ...prev, barcode: data.barcode }))
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "No se pudo generar el código",
      })
    } finally {
      setGeneratingBarcode(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Nombrar los campos que faltan: "complete los campos obligatorios" obliga
    // al usuario a adivinar cuál de los tres es.
    const faltantes = [
      !formData.name.trim() && "Nombre del Material",
      !formData.barcode.trim() && "Código de Barras",
      !formData.category_id && "Categoría",
      !formData.supplier_id && "Proveedor",
    ].filter(Boolean)

    if (faltantes.length > 0) {
      toast.error("Faltan datos", {
        description: `Completá: ${faltantes.join(", ")}`,
      })
      return
    }

    if (Number(formData.min_stock) > Number(formData.max_stock)) {
      toast.error("Revisá el stock", {
        description: "El stock mínimo no puede ser mayor que el stock máximo",
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
          barcode: formData.barcode.trim(),
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
        if (error.detail) console.error("Detalle del server:", error.detail)
        throw new Error(error.error || "Error al crear material")
      }

      toast.success("Material creado", {
        description: `${formData.name} se agregó correctamente al inventario`,
      })
      
      // Retrasamos un poco la navegación para evitar que la página se rompa al redirigir
      setTimeout(() => {
        router.push("/inventory")
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
    <div className="bg-background">
      <main className="container mx-auto px-4 py-6">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <Home className="w-3.5 h-3.5" />
            Inicio
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/inventory" className="hover:text-foreground transition-colors">
            Inventario
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Nuevo Material</span>
        </nav>

        <Card>
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
              <MaterialFormFields
                data={formData}
                onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
                categories={categories}
                suppliers={suppliers}
                onGenerateBarcode={generateBarcode}
                generatingBarcode={generatingBarcode}
                loadingOptions={loadingOptions}
                optionsError={optionsError}
                withInitialStock
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => router.push("/inventory")}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
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
