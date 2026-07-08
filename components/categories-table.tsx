"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Trash2, Plus, Loader2 } from "lucide-react"
import { createCategory, deleteCategory } from "@/lib/actions"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface Category {
    id: number
    name: string
    description: string | null
}

export function CategoriesTable({ categories }: { categories: Category[] }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [pendingId, setPendingId] = useState<number | null>(null)
    const { toast } = useToast()
    const router = useRouter()

    async function handleCreate(formData: FormData) {
        setLoading(true)
        const result = await createCategory(formData)
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
                description: "Categoría creada correctamente",
            })
            setOpen(false)
            router.refresh()
        }
    }

    async function doDelete() {
        if (pendingId == null) return
        setLoading(true)
        const result = await deleteCategory(pendingId)
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
            setPendingId(null)
            toast("Éxito", {
                description: "Categoría eliminada correctamente",
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
                            Nueva Categoría
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Agregar Categoría</DialogTitle>
                        </DialogHeader>
                        <form action={handleCreate} className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nombre</Label>
                                <Input id="name" name="name" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Descripción</Label>
                                <Textarea id="description" name="description" />
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
                            <TableHead>Descripción</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {categories.map((category) => (
                            <TableRow key={category.id}>
                                <TableCell className="font-medium">{category.name}</TableCell>
                                <TableCell>{category.description || "-"}</TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setPendingId(category.id)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {categories.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                    No hay categorías registradas
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <ConfirmDialog
                open={pendingId != null}
                onOpenChange={(o) => !o && setPendingId(null)}
                title="Eliminar categoría"
                description="Esta acción no se puede deshacer. ¿Querés eliminar esta categoría?"
                confirmLabel="Eliminar"
                destructive
                loading={loading}
                onConfirm={doDelete}
            />
        </div>
    )
}
