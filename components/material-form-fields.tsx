"use client"

// Campos compartidos del formulario de material (los usan la página "Nuevo Material"
// y el modal "Editar Material", que tienen exactamente los mismos campos). El estado y
// el submit los maneja cada contenedor; acá solo van los inputs y su layout.

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

export function MaterialFormFields({
    data,
    onChange,
    categories,
    suppliers,
    onGenerateBarcode,
    generatingBarcode = false,
    withInitialStock = false,
}: {
    data: MaterialFormData
    onChange: (patch: Partial<MaterialFormData>) => void
    categories: Option[]
    suppliers: Option[]
    onGenerateBarcode?: () => void
    generatingBarcode?: boolean
    withInitialStock?: boolean
}) {
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
                <Label htmlFor="barcode">Código de Barras</Label>
                <div className="flex gap-2">
                    <Input
                        id="barcode"
                        placeholder="Escanear o ingresar"
                        value={data.barcode}
                        onChange={(e) => onChange({ barcode: e.target.value })}
                        maxLength={100}
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
                <Select value={data.category_id} onValueChange={(v) => onChange({ category_id: v })}>
                    <SelectTrigger className="w-full">
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
                <Select value={data.supplier_id} onValueChange={(v) => onChange({ supplier_id: v })}>
                    <SelectTrigger className="w-full">
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
                <Label htmlFor="unit_cost">Costo Unitario (USD)</Label>
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
