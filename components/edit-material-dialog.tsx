"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Edit, Loader2, Save, Trash2 } from "lucide-react"
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

interface Material {
    id: number
    name: string
    barcode: string
    description?: string
    category_id: number
    supplier_id: number
    unit_of_measure: string
    unit_cost: number
    min_stock: number
    max_stock: number
}

interface EditMaterialDialogProps {
    material: any
    categories: Category[]
    suppliers: Supplier[]
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export function EditMaterialDialog({ material, categories, suppliers, open: controlledOpen, onOpenChange: controlledOnOpenChange }: EditMaterialDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const { toast } = useToast()
    const router = useRouter()

    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = isControlled ? (controlledOnOpenChange || (() => { })) : setInternalOpen

    const [loading, setLoading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const [formData, setFormData] = useState({
        name: "",
        barcode: "",
        description: "",
        category_id: "",
        supplier_id: "",
        unit_of_measure: "Unidad",
        unit_cost: "",
        min_stock: "",
        max_stock: "",
    })

    useEffect(() => {
        if (open && material) {
            setShowDeleteConfirm(false)
            setFormData({
                name: material.name || "",
                barcode: material.barcode || "",
                description: material.description || "",
                category_id: material.category_id?.toString() || "",
                supplier_id: material.supplier_id?.toString() || "",
                unit_of_measure: material.unit_of_measure || "Unidad",
                unit_cost: material.unit_cost?.toString() || "0",
                min_stock: material.min_stock?.toString() || "10",
                max_stock: material.max_stock?.toString() || "100",
            })
        }
    }, [open, material])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const response = await fetch(`/api/materials/${material.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    barcode: formData.barcode || null,
                    description: formData.description || null,
                    category_id: parseInt(formData.category_id),
                    supplier_id: parseInt(formData.supplier_id),
                    unit_of_measure: formData.unit_of_measure,
                    unit_cost: parseFloat(formData.unit_cost) || 0,
                    min_stock: parseInt(formData.min_stock) || 10,
                    max_stock: parseInt(formData.max_stock) || 100,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Error al actualizar material")
            }

            toast.success("Material actualizado", {
                description: "Los cambios se han guardado correctamente",
            })

            setOpen(false)
            router.refresh()
        } catch (error) {
            toast.error("Error", {
                description: error instanceof Error ? error.message : "No se pudo actualizar el material",
            })
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const response = await fetch(`/api/materials/${material.id}`, {
                method: "DELETE",
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Error al eliminar material")
            }

            toast.success("Material eliminado", {
                description: "El producto ha sido eliminado del sistema",
            })

            setOpen(false)
            router.refresh()
        } catch (error) {
            toast.error("Error", {
                description: error instanceof Error ? error.message : "No se pudo eliminar el material",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {!isControlled && (
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <Edit className="w-4 h-4" />
                    </Button>
                </DialogTrigger>
            )}
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
                <DialogHeader>
                    <DialogTitle>{showDeleteConfirm ? "¿Eliminar material?" : "Editar Material"}</DialogTitle>
                    <DialogDescription>
                        {showDeleteConfirm 
                            ? `¿Estás seguro de que deseas eliminar ${material.name}? Esta acción no se puede deshacer.`
                            : `Modificar los detalles del material ${material.name}`}
                    </DialogDescription>
                </DialogHeader>

                {showDeleteConfirm ? (
                    <div className="py-6 space-y-4">
                        <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20 text-destructive text-sm">
                            <strong>Atención:</strong> Se eliminarán todos los registros asociados a este material.
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                            >
                                Cancelar
                            </Button>
                            <Button 
                                type="button" 
                                variant="destructive" 
                                onClick={handleDelete}
                                disabled={isDeleting}
                            >
                                {isDeleting ? "Eliminando..." : "Sí, eliminar definitivamente"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <MaterialFormFields
                            data={formData}
                            onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
                            categories={categories}
                            suppliers={suppliers}
                        />

                        <div className="flex justify-between items-center pt-4">
                            <Button 
                                type="button" 
                                variant="destructive"
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Eliminar
                            </Button>

                            <div className="flex gap-3">
                                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
                                            Guardar Cambios
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
