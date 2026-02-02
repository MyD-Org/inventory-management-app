"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, RotateCcw, Loader2, Calendar } from "lucide-react"

interface Movement {
    id: number
    movement_type: string
    quantity: number
    previous_stock: number
    new_stock: number
    reference_number: string | null
    notes: string | null
    user_name: string | null
    created_at: string
}

interface MaterialMovementSummaryProps {
    materialId: number
    materialName: string
    barcode: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function MaterialMovementSummary({ materialId, materialName, barcode, open, onOpenChange }: MaterialMovementSummaryProps) {
    const [movements, setMovements] = useState<Movement[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (open && materialId) {
            fetchMovements()
        }
    }, [open, materialId])

    const fetchMovements = async () => {
        setLoading(true)
        try {
            // Reutilizamos el parámetro de búsqueda para el historial filtrado por código
            const response = await fetch(`/api/materials/${materialId}/movements`)
            if (response.ok) {
                const data = await response.json()
                setMovements(data)
            }
        } catch (error) {
            console.error("Error fetching movements:", error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Calendar className="w-5 h-5 text-primary" />
                        Historial: {materialName}
                    </DialogTitle>
                    <DialogDescription className="font-mono">
                        Código: {barcode}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto mt-4 pr-2">
                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : movements.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                            No hay movimientos registrados para este producto.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {movements.map((m) => (
                                <div key={m.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                    <div className="mt-1">
                                        {m.movement_type === "entrada" ? (
                                            <TrendingUp className="w-4 h-4 text-green-600" />
                                        ) : m.movement_type === "salida" ? (
                                            <TrendingDown className="w-4 h-4 text-red-600" />
                                        ) : (
                                            <RotateCcw className="w-4 h-4 text-blue-600" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between gap-2">
                                            <div className="text-sm font-medium">
                                                {m.movement_type.charAt(0).toUpperCase() + m.movement_type.slice(1)}
                                                {m.reference_number && <span className="text-muted-foreground font-normal ml-2">({m.reference_number})</span>}
                                            </div>
                                            <div className="text-right">
                                                <Badge variant={m.movement_type === "entrada" ? "default" : m.movement_type === "salida" ? "destructive" : "secondary"} className="text-[10px] h-5 px-1.5">
                                                    {m.movement_type === "entrada" ? "+" : m.movement_type === "salida" ? "-" : "±"}
                                                    {Math.abs(m.quantity)}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end mt-1">
                                            <div className="text-[11px] text-muted-foreground">
                                                Por: {m.user_name || "Sistema"}
                                                <div className="text-[10px]">
                                                    {new Date(m.created_at).toLocaleDateString("es-AR", {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                        year: "2-digit",
                                                        hour: "2-digit",
                                                        minute: "2-digit"
                                                    })}
                                                </div>
                                            </div>
                                            <div className="text-[11px] font-mono text-muted-foreground">
                                                {m.previous_stock} → <span className="font-bold text-foreground">{m.new_stock}</span>
                                            </div>
                                        </div>
                                        {m.notes && <div className="mt-2 text-[10px] italic text-muted-foreground border-t pt-1">{m.notes}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
