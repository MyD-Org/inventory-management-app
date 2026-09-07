"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ExpenseDialog } from "@/components/expense-dialog"
import { useToast } from "@/hooks/use-toast"
import { deleteExpense } from "@/lib/gastos-actions"
import { formatArs } from "@/lib/format"
import { formatearFechaCorta, labelMedioPago, type CategoriaGasto, type GastoRow } from "@/lib/gastos"

// Detalle del mes: la lista con editar/borrar, el botón "Nuevo gasto" y los
// dos diálogos. Recibe todo como props desde la server page; no consulta la
// base, solo dispara actions y refresca.
export function GastosClient({
    expenses,
    categories,
}: {
    expenses: GastoRow[]
    categories: CategoriaGasto[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<GastoRow | null>(null)
    const [pendingDelete, setPendingDelete] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)

    async function doDelete() {
        if (pendingDelete === null) return
        setDeleting(true)
        const result = await deleteExpense(pendingDelete)
        setDeleting(false)
        setPendingDelete(null)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        toast.success("Gasto eliminado")
        router.refresh()
    }

    return (
        <>
            <div className="mb-3 flex justify-end">
                <Button
                    size="sm"
                    onClick={() => {
                        setEditing(null)
                        setDialogOpen(true)
                    }}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo gasto
                </Button>
            </div>

            {expenses.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    No hay gastos cargados en este mes.
                </p>
            ) : (
                <div className="overflow-hidden rounded-lg border">
                    {expenses.map((g) => (
                        <div
                            key={g.id}
                            className="group flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 last:border-b-0 hover:bg-muted/50"
                        >
                            <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                                {formatearFechaCorta(g.expense_date)}
                            </span>
                            <span className="min-w-0 flex-1 basis-40">
                                <span className="block truncate text-sm font-medium">{g.description}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {g.category_name} · {labelMedioPago(g.payment_method)}
                                </span>
                            </span>
                            <span className="tabular-nums text-sm font-semibold">{formatArs(Number(g.amount))}</span>
                            <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Editar"
                                    onClick={() => {
                                        setEditing(g)
                                        setDialogOpen(true)
                                    }}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Borrar"
                                    onClick={() => setPendingDelete(g.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <ExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} expense={editing} categories={categories} />

            <ConfirmDialog
                open={pendingDelete !== null}
                onOpenChange={(open) => !open && setPendingDelete(null)}
                title="Eliminar gasto"
                description="Se borra el gasto cargado. No se puede deshacer."
                confirmLabel="Eliminar"
                destructive
                loading={deleting}
                onConfirm={doDelete}
            />
        </>
    )
}
