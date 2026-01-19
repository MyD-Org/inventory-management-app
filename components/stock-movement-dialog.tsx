"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Save, Plus, Minus, Scan, Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Material {
    id: number
    name: string
    barcode: string
    current_stock?: number
    unit_of_measure?: string
}

interface StockMovementDialogProps {
    type: "entrada" | "salida"
    materials: Material[]
    trigger?: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export function StockMovementDialog({ type, materials, trigger, open: controlledOpen, onOpenChange: setControlledOpen }: StockMovementDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()
    const router = useRouter()

    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = isControlled ? setControlledOpen : setInternalOpen

    const [barcode, setBarcode] = useState("")
    const [formData, setFormData] = useState({
        material_id: "",
        quantity: "",
        notes: "",
        reference_number: "",
    })

    const quantityInputRef = useRef<HTMLInputElement>(null)
    const barcodeInputRef = useRef<HTMLInputElement>(null)

    const selectedMaterial = materials.find(m => m.id.toString() === formData.material_id)

    // Auto-focus barcode input when dialog opens
    useEffect(() => {
        if (open) {
            setTimeout(() => {
                barcodeInputRef.current?.focus()
            }, 100)
        }
    }, [open])

    const handleBarcodeSubmit = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            findMaterialByBarcode(barcode)
        }
    }

    const findMaterialByBarcode = (code: string) => {
        const foundMaterial = materials.find(m => m.barcode === code)

        if (foundMaterial) {
            setFormData(prev => ({ ...prev, material_id: foundMaterial.id.toString() }))
            toast.success("Material encontrado", {
                description: `${foundMaterial.name}`,
            })
            // Move focus to quantity
            setTimeout(() => {
                quantityInputRef.current?.focus()
            }, 100)
        } else {
            toast.error("No encontrado", {
                description: "No se encontró ningún material con ese código",
            })
            setFormData(prev => ({ ...prev, material_id: "" }))
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.material_id || !formData.quantity) {
            toast.error("Error", {
                description: "Por favor complete los campos obligatorios",
            })
            return
        }

        setLoading(true)

        try {
            const response = await fetch("/api/stock/movement", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    material_id: parseInt(formData.material_id),
                    movement_type: type,
                    quantity: parseInt(formData.quantity), // Changed to parseInt
                    reference_number: formData.reference_number || null,
                    notes: formData.notes || null,
                    user_name: "Usuario Actual", // TODO: Replace with actual user
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Error al registrar movimiento")
            }

            toast.success(`Movimiento registrado: ${type} de stock`, {
                description: `${selectedMaterial?.name} - Cantidad: ${formData.quantity}`,
            })

            setOpen?.(false)
            setFormData({
                material_id: "",
                quantity: "",
                notes: "",
                reference_number: "",
            })
            setBarcode("")
            router.refresh()
        } catch (error) {
            toast.error("Error", {
                description: error instanceof Error ? error.message : "No se pudo registrar el movimiento",
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {type === "entrada" ? (
                            <Plus className="w-5 h-5 text-green-500" />
                        ) : (
                            <Minus className="w-5 h-5 text-red-500" />
                        )}
                        Registrar {type === "entrada" ? "Entrada" : "Salida"} de Stock
                    </DialogTitle>
                    <DialogDescription>
                        Escanee el código de barras o seleccione el material manualmente.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Barcode Input Section - Primary Focus */}
                    <div className="bg-muted/50 p-4 rounded-lg border-2 border-dashed border-muted-foreground/25">
                        <Label htmlFor="barcode-input" className="mb-2 block font-semibold">
                            <Scan className="w-4 h-4 inline mr-2" />
                            Escanear Código
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                id="barcode-input"
                                ref={barcodeInputRef}
                                placeholder="Haga clic aquí y escanee..."
                                value={barcode}
                                onChange={(e) => setBarcode(e.target.value)}
                                onKeyDown={handleBarcodeSubmit}
                                className="font-mono text-lg"
                                autoComplete="off"
                            />
                            <Button
                                type="button"
                                size="icon"
                                onClick={() => findMaterialByBarcode(barcode)}
                            >
                                <Search className="w-4 h-4" />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Presione Enter después de escanear o escribir el código.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Material Info Display - Only shows when material is found */}
                        <div className="space-y-2">
                            <Label>Material Identificado</Label>
                            {selectedMaterial ? (
                                <div className="bg-muted p-3 rounded-lg border">
                                    <div className="font-bold text-lg">{selectedMaterial.name}</div>
                                    <div className="text-sm text-muted-foreground font-mono mb-2">{selectedMaterial.barcode}</div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="font-medium">Stock Actual:</span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${(selectedMaterial.current_stock || 0) <= 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                                            }`}>
                                            {selectedMaterial.current_stock} {selectedMaterial.unit_of_measure}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-muted/30 p-3 rounded-lg border border-dashed text-center text-muted-foreground text-sm py-6">
                                    Escanee un código para identificar el material
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="quantity">Cantidad a {type === "entrada" ? "Ingresar" : "Retirar"} *</Label>
                            <Input
                                id="quantity"
                                ref={quantityInputRef}
                                type="number"
                                min="1"
                                step="1"
                                placeholder="0"
                                value={formData.quantity}
                                onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                                className="text-lg font-semibold"
                                required
                                disabled={!selectedMaterial}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notas (Opcional)</Label>
                            <Input
                                id="notes"
                                placeholder="Referencia, motivo, etc."
                                value={formData.notes}
                                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={() => setOpen?.(false)}>
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading || !formData.material_id || !formData.quantity}
                                className={type === "entrada" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Procesando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Confirmar {type === "entrada" ? "Entrada" : "Salida"}
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    )
}
