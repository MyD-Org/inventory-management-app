"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { saveExpense } from "@/lib/gastos-actions"
import { PAYMENT_METHODS, type CategoriaGasto, type GastoRow } from "@/lib/gastos"

// Modal de alta/edición. El control ES el valor (estilo Linear): al elegir o
// salir del campo se guarda solo con el submit. En edición, si la categoría
// del gasto fue desactiva después, se la sigue ofreciendo (no se fuerza a
// recategorizar), criterio que también valida la server action.
export function ExpenseDialog({
    open,
    onOpenChange,
    expense,
    categories,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    expense: GastoRow | null
    categories: CategoriaGasto[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    const [expenseDate, setExpenseDate] = useState("")
    const [categoryId, setCategoryId] = useState("")
    const [description, setDescription] = useState("")
    const [amount, setAmount] = useState("")
    const [paymentMethod, setPaymentMethod] = useState("transferencia")

    const hoy = new Date().toLocaleDateString("sv") // YYYY-MM-DD local

    // Al abrir (o cambiar el gasto en edición) se precargan los campos.
    useEffect(() => {
        if (!open) return
        setExpenseDate(expense?.expense_date ?? hoy)
        setCategoryId(expense ? String(expense.category_id) : "")
        setDescription(expense?.description ?? "")
        setAmount(expense ? String(Number(expense.amount)) : "")
        setPaymentMethod(expense?.payment_method ?? "transferencia")
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, expense])

    const opcionesCategoria = expense
        ? categories.filter((c) => c.active || c.id === expense.category_id)
        : categories.filter((c) => c.active)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!categoryId) {
            toast.error("Falta la categoría", { description: "Creá una en “Categorías” si todavía no hay." })
            return
        }
        setSaving(true)
        const result = await saveExpense(expense?.id ?? null, {
            expense_date: expenseDate,
            category_id: Number(categoryId),
            description,
            amount,
            payment_method: paymentMethod,
        })
        setSaving(false)
        if (result.error) {
            toast.error("No se pudo guardar el gasto", { description: result.error })
            return
        }
        toast.success(expense ? "Gasto actualizado" : "Gasto cargado")
        onOpenChange(false)
        router.refresh()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{expense ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="gasto-fecha">Fecha</Label>
                            <Input
                                id="gasto-fecha"
                                type="date"
                                value={expenseDate}
                                max={hoy}
                                onChange={(e) => setExpenseDate(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="gasto-monto">Monto</Label>
                            <Input
                                id="gasto-monto"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Categoría</Label>
                        <Select value={categoryId} onValueChange={setCategoryId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Elegí una categoría" />
                            </SelectTrigger>
                            <SelectContent>
                                {opcionesCategoria.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="gasto-desc">Descripción</Label>
                        <Input
                            id="gasto-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Ej: Factura de luz"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Medio de pago</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PAYMENT_METHODS.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Guardando…" : "Guardar gasto"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
