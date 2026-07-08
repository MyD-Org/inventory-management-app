"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Trash2 } from "lucide-react"
import { deleteBudget } from "@/lib/budget-actions"
import { useToast } from "@/hooks/use-toast"
import { formatArs } from "@/components/budget-editor"
import { ConfirmDialog } from "@/components/confirm-dialog"

export interface BudgetRow {
    id: number
    name: string
    status: "draft" | "final"
    margin_pct: number
    cost: number
    created_by: string | null
    created_at: string
}

export function BudgetsTable({ budgets }: { budgets: BudgetRow[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [pendingId, setPendingId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)

    async function doDelete() {
        if (pendingId == null) return
        setDeleting(true)
        const result = await deleteBudget(pendingId)
        setDeleting(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
        } else {
            setPendingId(null)
            toast.success("Cálculo eliminado")
            router.refresh()
        }
    }

    return (
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Costo de fabricación</TableHead>
                        <TableHead>Precio venta sugerido</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Creado por</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {budgets.map((b) => {
                        const sale = b.cost * (1 + Number(b.margin_pct) / 100)
                        return (
                            <TableRow
                                key={b.id}
                                className="cursor-pointer"
                                onClick={() => router.push(`/costos/${b.id}`)}
                            >
                                <TableCell className="font-medium">{b.name}</TableCell>
                                <TableCell>{new Date(b.created_at).toLocaleDateString("es-AR")}</TableCell>
                                <TableCell>{formatArs(b.cost)}</TableCell>
                                <TableCell className="font-medium">{formatArs(sale)}</TableCell>
                                <TableCell>
                                    <Badge variant={b.status === "final" ? "default" : "secondary"}>
                                        {b.status === "final" ? "Final" : "Borrador"}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{b.created_by || "-"}</TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setPendingId(b.id)
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )
                    })}
                    {budgets.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                No hay cálculos de costo todavía. Creá uno con el botón de arriba o pedile una propuesta al Asistente.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            <ConfirmDialog
                open={pendingId != null}
                onOpenChange={(o) => !o && setPendingId(null)}
                title="Eliminar cálculo de costo"
                description="Esta acción no se puede deshacer. ¿Querés eliminar este cálculo de costo?"
                confirmLabel="Eliminar"
                destructive
                loading={deleting}
                onConfirm={doDelete}
            />
        </div>
    )
}
