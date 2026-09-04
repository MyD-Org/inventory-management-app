"use client"

// Campos compartidos del formulario de material (los usan la página "Nuevo Material"
// y el modal "Editar Material", que tienen exactamente los mismos campos). El estado y
// el submit los maneja cada contenedor; acá solo van los inputs y su layout.

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { QuickCreateSelect } from "@/components/quick-create-select"
import { createCategory, createSupplier } from "@/lib/actions"
import { Sparkles, Loader2 } from "lucide-react"

export interface MaterialFormData {
    name: string
    barcode: string
    description: string
    category_id: string
    supplier_id: string
    unit_of_measure: string
    unit_cost: string
    min_stock: string
    max_stock: string
    initial_stock?: string // solo al crear un material
}

interface Option {
    id: number
    name: string
}

const UNITS = ["Unidad", "Pieza", "Metro", "Kg", "Litro", "Rollo", "Caja"]

// El costo siempre se carga por unidad de medida, así que la etiqueta lo dice
// explícito ("Costo por metro") en vez del genérico "Costo Unitario".
const COST_LABEL: Record<string, string> = {
    Unidad: "Costo Unitario",
    Pieza: "Costo por Pieza",
    Metro: "Costo por Metro",
    Kg: "Costo por Kilogramo",
    Litro: "Costo por Litro",
    Rollo: "Costo por Rollo",
    Caja: "Costo por Caja",
}

export function MaterialFormFields({
    data,
    onChange,
    categories,
    suppliers,
    onGenerateBarcode,
    generatingBarcode = false,
    withInitialStock = false,
    loadingOptions = false,
    optionsError = false,
}: {
    data: MaterialFormData
    onChange: (patch: Partial<MaterialFormData>) => void
    categories: Option[]
    suppliers: Option[]
    onGenerateBarcode?: () => void
    generatingBarcode?: boolean
    withInitialStock?: boolean
    /** Las categorías/proveedores todavía se están trayendo del servidor. */
    loadingOptions?: boolean
    /** La carga de categorías/proveedores falló después de reintentar sola. */
    optionsError?: boolean
}) {
    // Las opciones creadas desde el "+" se suman acá: el contenedor las trae del
    // servidor al montar y no se vuelve a consultar mientras el form está abierto.
    const [newCategories, setNewCategories] = useState<Option[]>([])
    const [newSuppliers, setNewSuppliers] = useState<Option[]>([])
    const allCategories = [...categories, ...newCategories]
    const allSuppliers = [...suppliers, ...newSuppliers]

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name">Nombre del Material *</Label>
                <Input
                    id="name"
                    placeholder="Ej: LED SMD 5050"
                    value={data.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                    required
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="barcode">Código de Barras *</Label>
                <div className="flex gap-2">
                    <Input
                        id="barcode"
                        placeholder="Escanear o ingresar"
                        value={data.barcode}
                        onChange={(e) => onChange({ barcode: e.target.value })}
                        maxLength={100}
                        required
                    />
                    {onGenerateBarcode && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onGenerateBarcode}
                            disabled={generatingBarcode}
                            title="Generar un código único automáticamente"
                            className="shrink-0"
                        >
                            {generatingBarcode ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Sparkles className="w-4 h-4 mr-2" />
                            )}
                            Generar
                        </Button>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="unit_of_measure">Unidad de Medida</Label>
                <Select value={data.unit_of_measure} onValueChange={(v) => onChange({ unit_of_measure: v })}>
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                                {u === "Kg" ? "Kilogramo" : u}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="category_id">Categoría *</Label>
                <QuickCreateSelect
                    value={data.category_id}
                    onChange={(v) => onChange({ category_id: v })}
                    options={allCategories}
                    onCreated={(opt) => setNewCategories((prev) => [...prev, opt])}
                    placeholder="Seleccionar categoría"
                    dialogTitle="Nueva categoría"
                    dialogDescription="Se crea y queda seleccionada en este material."
                    namePlaceholder="Ej: Cables"
                    extraLabel="Descripción"
                    extraPlaceholder="Opcional"
                    onCreate={createCategory}
                    loading={loadingOptions}
                    error={optionsError}
                    emptyHint="No hay categorías cargadas. Creá la primera con el botón +."
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="supplier_id">Proveedor *</Label>
                <QuickCreateSelect
                    value={data.supplier_id}
                    onChange={(v) => onChange({ supplier_id: v })}
                    options={allSuppliers}
                    onCreated={(opt) => setNewSuppliers((prev) => [...prev, opt])}
                    placeholder="Seleccionar proveedor"
                    dialogTitle="Nuevo proveedor"
                    dialogDescription="Se crea y queda seleccionado en este material."
                    namePlaceholder="Ej: Electro SRL"
                    extraLabel="Contacto"
                    extraPlaceholder="Teléfono, email o dirección (opcional)"
                    onCreate={createSupplier}
                    loading={loadingOptions}
                    error={optionsError}
                    emptyHint="No hay proveedores cargados. Creá el primero con el botón +."
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="unit_cost">
                    {COST_LABEL[data.unit_of_measure] ?? "Costo Unitario"} (USD)
                </Label>
                <Input
                    id="unit_cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={data.unit_cost}
                    onChange={(e) => onChange({ unit_cost: e.target.value })}
                />
            </div>

            {withInitialStock && (
                <div className="space-y-2">
                    <Label htmlFor="initial_stock">Stock Inicial</Label>
                    <Input
                        id="initial_stock"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={data.initial_stock ?? ""}
                        onChange={(e) => onChange({ initial_stock: e.target.value })}
                    />
                </div>
            )}

            <div className="space-y-2">
                <Label htmlFor="min_stock">Stock Mínimo</Label>
                <Input
                    id="min_stock"
                    type="number"
                    min="0"
                    value={data.min_stock}
                    onChange={(e) => onChange({ min_stock: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="max_stock">Stock Máximo</Label>
                <Input
                    id="max_stock"
                    type="number"
                    min="0"
                    value={data.max_stock}
                    onChange={(e) => onChange({ max_stock: e.target.value })}
                />
            </div>

            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                    id="description"
                    rows={3}
                    value={data.description}
                    onChange={(e) => onChange({ description: e.target.value })}
                />
            </div>
        </div>
    )
}
