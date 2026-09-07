"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Check, Pencil, Plus, Tag, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
    createExpenseCategory,
    renameExpenseCategory,
    setExpenseCategoryActive,
} from "@/lib/gastos-actions"
import type { CategoriaGasto } from "@/lib/gastos"

// Las categorías se administran acá, no en código: crear, renombrar y
// activar/desactivar. No hay borrado físico: una categoría usada por gastos
// viejos se desactiva y desaparece del selector de carga.
export function ExpenseCategoriesManager({ categories }: { categories: CategoriaGasto[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [nueva, setNueva] = useState("")
    const [editandoId, setEditandoId] = useState<number | null>(null)
    const [editandoNombre, setEditandoNombre] = useState("")
    const [saving, setSaving] = useState(false)

    async function agregar() {
        if (!nueva.trim()) return
        setSaving(true)
        const result = await createExpenseCategory(nueva)
        setSaving(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        setNueva("")
        toast.success("Categoría creada")
        router.refresh()
    }

    async function guardarRenombre(id: number) {
        if (!editandoNombre.trim()) return
        setSaving(true)
        const result = await renameExpenseCategory(id, editandoNombre)
        setSaving(false)
        setEditandoId(null)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        toast.success("Categoría renombrada")
        router.refresh()
    }

    async function toggle(id: number, active: boolean) {
        const result = await setExpenseCategoryActive(id, active)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        router.refresh()
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Tag className="mr-2 h-4 w-4" />
                    Categorías
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Categorías de gasto</DialogTitle>
                </DialogHeader>

                <div className="flex gap-2">
                    <Input
                        placeholder="Nueva categoría"
                        value={nueva}
                        onChange={(e) => setNueva(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault()
                                agregar()
                            }
                        }}
                    />
                    <Button variant="outline" onClick={agregar} disabled={!nueva.trim() || saving} aria-label="Agregar categoría">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>

                <div className="mt-4 space-y-1.5">
                    {categories.length === 0 && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                            Todavía no hay categorías. Creá la primera arriba.
                        </p>
                    )}
                    {categories.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                            {editandoId === c.id ? (
                                <>
                                    <Input
                                        value={editandoNombre}
                                        onChange={(e) => setEditandoNombre(e.target.value)}
                                        className="h-8"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault()
                                                guardarRenombre(c.id)
                                            }
                                        }}
                                    />
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Guardar" onClick={() => guardarRenombre(c.id)}>
                                        <Check className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Cancelar" onClick={() => setEditandoId(null)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <span className={`flex-1 truncate text-sm ${c.active ? "" : "text-muted-foreground line-through"}`}>
                                        {c.name}
                                    </span>
                                    <Switch checked={c.active} onCheckedChange={(v) => toggle(c.id, v)} aria-label={`${c.name} activa`} />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        title="Renombrar"
                                        onClick={() => {
                                            setEditandoId(c.id)
                                            setEditandoNombre(c.name)
                                        }}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
