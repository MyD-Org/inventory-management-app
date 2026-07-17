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
import { useDebouncedCallback } from "use-debounce"

interface Material {
    id: number
    name: string
    barcode: string
    current_stock?: number
    unit_of_measure?: string
    unit_cost?: number | string | null
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
    // Precio unitario del ingreso. Solo se muestra/manda en ENTRADAS. Prefill con
    // el unit_cost actual del material (evita pisar el costo con "" si se deja vacío).
    const [unitCost, setUnitCost] = useState("")

    const [materialError, setMaterialError] = useState(false)
    const [quantityError, setQuantityError] = useState(false)
    const [notFoundCode, setNotFoundCode] = useState<string | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [suggestOpen, setSuggestOpen] = useState(false)
    // Índice de la sugerencia resaltada para navegación con ↑/↓ + Enter.
    // -1 = nada resaltado (Enter cae al fallback: buscar por código exacto).
    const [activeIndex, setActiveIndex] = useState(-1)
    const scanBoxRef = useRef<HTMLDivElement>(null)
    const suggestionsRef = useRef<HTMLDivElement>(null)

    const quantityInputRef = useRef<HTMLInputElement>(null)
    const barcodeInputRef = useRef<HTMLInputElement>(null)

    const selectedMaterial = materials.find(m => m.id.toString() === formData.material_id)

    // Sugerencias por nombre o código (mientras no haya un material ya identificado).
    const query = barcode.trim().toLowerCase()
    const suggestions = query
        ? materials
            .filter(m => m.name.toLowerCase().includes(query) || (m.barcode || "").toLowerCase().includes(query))
            .slice(0, 8)
        : []

    // Selecciona un material (desde escaneo, sugerencia o búsqueda exacta) y va a cantidad.
    const selectMaterial = (m: Material) => {
        setFormData(prev => ({ ...prev, material_id: m.id.toString() }))
        setMaterialError(false)
        setNotFoundCode(null)
        setSuggestOpen(false)
        setBarcode(m.barcode || m.name)
        // Prefill precio con el unit_cost actual (viene como string desde Postgres DECIMAL).
        const currentCost = Number(m.unit_cost ?? 0)
        setUnitCost(currentCost > 0 ? String(currentCost) : "")
        setTimeout(() => quantityInputRef.current?.focus(), 100)
    }

    // Cerrar el dropdown de sugerencias al hacer click afuera.
    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (scanBoxRef.current && !scanBoxRef.current.contains(e.target as Node)) setSuggestOpen(false)
        }
        document.addEventListener("mousedown", onDoc)
        return () => document.removeEventListener("mousedown", onDoc)
    }, [])

    // Cada vez que cambian las sugerencias (por nueva query), reseteamos el índice
    // resaltado — así no queda apuntando a un item que ya no existe en la lista.
    useEffect(() => {
        setActiveIndex(-1)
    }, [query])

    // Al abrir: resetear a estado limpio (no reabrir con lo de la vez anterior) y enfocar.
    useEffect(() => {
        if (open) {
            setFormData({ material_id: "", quantity: "", notes: "", reference_number: "" })
            setBarcode("")
            setUnitCost("")
            setMaterialError(false)
            setQuantityError(false)
            setNotFoundCode(null)
            setSubmitError(null)
            setSuggestOpen(false)
            setActiveIndex(-1)
            setTimeout(() => {
                barcodeInputRef.current?.focus()
            }, 100)
        }
    }, [open])

    // Navegación por teclado del dropdown de sugerencias: ↑/↓ mueven el resaltado
    // (con wrap), Enter selecciona la activa o cae a búsqueda por código exacto si
    // no hay ninguna resaltada, Esc cierra el dropdown sin perder el foco.
    const handleBarcodeSubmit = (e: React.KeyboardEvent) => {
        const hasSuggestions = suggestOpen && suggestions.length > 0
        if (e.key === 'ArrowDown' && hasSuggestions) {
            e.preventDefault()
            setActiveIndex(prev => (prev + 1) % suggestions.length)
            return
        }
        if (e.key === 'ArrowUp' && hasSuggestions) {
            e.preventDefault()
            setActiveIndex(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1))
            return
        }
        if (e.key === 'Escape' && suggestOpen) {
            e.preventDefault()
            setSuggestOpen(false)
            setActiveIndex(-1)
            return
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            if (hasSuggestions && activeIndex >= 0) {
                selectMaterial(suggestions[activeIndex])
                return
            }
            findMaterialByBarcode(barcode)
        }
    }

    const findMaterialByBarcode = (code: string) => {
        const trimmed = code.trim()
        if (!trimmed) {
            toast.error("Falta el código", {
                description: "Escaneá o escribí un código para buscar el material.",
            })
            return
        }
        const foundMaterial = materials.find(m => m.barcode === trimmed)

        if (foundMaterial) {
            selectMaterial(foundMaterial)
        } else {
            // Se muestra en la caja del modal (no en toast).
            setNotFoundCode(trimmed)
            setFormData(prev => ({ ...prev, material_id: "" }))
        }
    }

    // Búsqueda automática ~350ms después de dejar de escribir (así el escáner o el tipeo
    // manual identifican el material sin apretar Enter). Silenciosa si no encuentra: no
    // molesta con "no encontrado" mientras seguís tipeando un código más largo.
    const autoSearch = useDebouncedCallback((code: string) => {
        const trimmed = code.trim()
        if (!trimmed) return
        const found = materials.find(m => m.barcode === trimmed)
        if (found) selectMaterial(found)
    }, 350)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.material_id) {
            setMaterialError(true)
            toast.error("Falta el material", {
                description: "Escaneá o escribí un código para identificar el material.",
            })
            barcodeInputRef.current?.focus()
            return
        }
        const qty = Number.parseInt(formData.quantity)
        if (!formData.quantity || Number.isNaN(qty) || qty <= 0) {
            setQuantityError(true)
            toast.error("Falta la cantidad", {
                description: `Ingresá cuántas unidades vas a ${type === "entrada" ? "ingresar" : "retirar"} (mayor a 0).`,
            })
            quantityInputRef.current?.focus()
            return
        }

        setLoading(true)
        setSubmitError(null)

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
                    // Precio solo aplica en entradas. Vacío → null (no pisa el unit_cost del material).
                    unit_cost: type === "entrada" && unitCost ? Number(unitCost) : null,
                    // El usuario se toma de la sesión en el servidor (ver /api/stock/movement)
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
            setUnitCost("")
            router.refresh()
        } catch (error) {
            // Se muestra dentro del modal (banner) para que no se pierda como el toast.
            setSubmitError(error instanceof Error ? error.message : "No se pudo registrar el movimiento")
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
                        <div className="relative" ref={scanBoxRef}>
                            <div className="flex gap-2">
                                <Input
                                    id="barcode-input"
                                    ref={barcodeInputRef}
                                    placeholder="Escaneá el código o buscá por nombre…"
                                    value={barcode}
                                    onChange={(e) => {
                                        const v = e.target.value
                                        setBarcode(v)
                                        // Si estabas editando el campo, deseleccioná el material anterior
                                        // para volver a buscar y mostrar sugerencias.
                                        if (formData.material_id) setFormData(prev => ({ ...prev, material_id: "" }))
                                        if (notFoundCode) setNotFoundCode(null)
                                        setSuggestOpen(true)
                                        autoSearch(v)
                                    }}
                                    onFocus={() => setSuggestOpen(true)}
                                    onKeyDown={handleBarcodeSubmit}
                                    className="text-lg"
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
                            {suggestOpen && !selectedMaterial && suggestions.length > 0 && (
                                <div
                                    ref={suggestionsRef}
                                    className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-auto"
                                >
                                    {suggestions.map((m, i) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => selectMaterial(m)}
                                            onMouseEnter={() => setActiveIndex(i)}
                                            ref={i === activeIndex ? (el) => {
                                                // Autoscroll para mantener visible la opción activa al navegar con flechas.
                                                el?.scrollIntoView({ block: "nearest" })
                                            } : undefined}
                                            className={`flex w-full items-center justify-between gap-3 p-2.5 text-left text-sm ${i === activeIndex ? "bg-muted" : "hover:bg-muted"}`}
                                        >
                                            <span className="min-w-0">
                                                <span className="font-medium">{m.name}</span>
                                                <span className="ml-2 font-mono text-xs text-muted-foreground">{m.barcode}</span>
                                            </span>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                stock {m.current_stock ?? 0}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
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
                            ) : notFoundCode ? (
                                <div className="rounded-lg border border-destructive bg-destructive/5 p-3 text-center text-sm py-6 text-destructive">
                                    No se encontró ningún material con el código{" "}
                                    <span className="font-mono font-semibold">{notFoundCode}</span>
                                </div>
                            ) : (
                                <div className={`bg-muted/30 p-3 rounded-lg border border-dashed text-center text-sm py-6 ${materialError ? "border-destructive text-destructive" : "text-muted-foreground"}`}>
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
                                onChange={(e) => { setFormData(prev => ({ ...prev, quantity: e.target.value })); if (quantityError) setQuantityError(false) }}
                                aria-invalid={quantityError}
                                className={`text-lg font-semibold ${quantityError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                                required
                                disabled={!selectedMaterial}
                            />
                        </div>
                        {type === "entrada" && (
                            <div className="space-y-2">
                                <Label htmlFor="unit-cost">Precio unitario (opcional)</Label>
                                <Input
                                    id="unit-cost"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Ej: 1250.50"
                                    value={unitCost}
                                    onChange={(e) => setUnitCost(e.target.value)}
                                    disabled={!selectedMaterial}
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notas (Opcional)</Label>
                            <Input
                                id="notes"
                                placeholder="Referencia, motivo, etc."
                                value={formData.notes}
                                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            />
                        </div>

                        {submitError && (
                            <div className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
                                {submitError}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={() => setOpen?.(false)}>
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading}
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
