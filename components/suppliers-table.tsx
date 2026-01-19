"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Trash2, Plus, Loader2 } from "lucide-react"
import { createSupplier, deleteSupplier } from "@/lib/actions"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface Supplier {
    id: number
    name: string
    contact_info: string | null
}

export function SuppliersTable({ suppliers }: { suppliers: Supplier[] }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()
    const router = useRouter()

    async function handleCreate(formData: FormData) {
        setLoading(true)
        const result = await createSupplier(formData)
        setLoading(false)

        if (result.error) {
            toast("Error", {
                description: result.error,
                action: {
                    label: "Cerrar",
                    onClick: () => console.log("Undo"),
                },
            })
        } else {
            toast("Éxito", {
                description: "Proveedor creado correctamente",
            })
            setOpen(false)
            router.refresh()
        }
    }

    async function handleDelete(id: number) {
        if (!confirm("¿Estás seguro de eliminar este proveedor?")) return

        const result = await deleteSupplier(id)

        if (result.error) {
            toast("Error", {
                description: result.error,
                action: {
                    label: "Cerrar",
                    onClick: () => console.log("Undo"),
                },
            })
        } else {
            toast("Éxito", {
                description: "Proveedor eliminado correctamente",
            })
            router.refresh()
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nuevo Proveedor
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Agregar Proveedor</DialogTitle>
                        </DialogHeader>
                        <form action={handleCreate} className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nombre</Label>
                                <Input id="name" name="name" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="contact_info">Información de Contacto</Label>
                                <Textarea id="contact_info" name="contact_info" placeholder="Teléfono, Email, Dirección..." />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Guardar"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Contacto</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {suppliers.map((supplier) => (
                            <TableRow key={supplier.id}>
                                <TableCell className="font-medium">{supplier.name}</TableCell>
                                <TableCell>{supplier.contact_info || "-"}</TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDelete(supplier.id)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {suppliers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                    No hay proveedores registrados
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
