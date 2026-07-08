"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Trash2 } from "lucide-react"
import { deleteQuote } from "@/lib/quote-actions"
import { useToast } from "@/hooks/use-toast"
import { formatArs } from "@/lib/format"
import { ConfirmDialog } from "@/components/confirm-dialog"

export interface QuoteRow {
    id: number
    title: string
    customer_name: string | null
    status: "draft" | "sent" | "accepted" | "rejected"
    total: number
    created_by: string | null
    created_at: string
    alegra_estimate_number: string | null
}

const STATUS: Record<QuoteRow["status"], { label: string; variant: "default" | "secondary" | "outline" }> = {
    draft: { label: "Borrador", variant: "secondary" },
    sent: { label: "Enviado", variant: "outline" },
    accepted: { label: "Aceptado", variant: "default" },
    rejected: { label: "Rechazado", variant: "outline" },
}

export function QuotesTable({ quotes }: { quotes: QuoteRow[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [pendingId, setPendingId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)

    async function doDelete() {
        if (pendingId == null) return
        setDeleting(true)
        const result = await deleteQuote(pendingId)
        setDeleting(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
        } else {
            setPendingId(null)
            toast.success("Presupuesto eliminado")
            router.refresh()
        }
    }

    return (
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {quotes.map((q) => (
                        <TableRow
                            key={q.id}
                            className="cursor-pointer"
                            onClick={() => router.push(`/presupuestos/${q.id}`)}
                        >
                            <TableCell className="font-medium">{q.title}</TableCell>
                            <TableCell className="text-muted-foreground">{q.customer_name || "-"}</TableCell>
                            <TableCell>{new Date(q.created_at).toLocaleDateString("es-AR")}</TableCell>
                            <TableCell className="font-medium">{formatArs(q.total)}</TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1.5">
                                    <Badge variant={STATUS[q.status].variant}>{STATUS[q.status].label}</Badge>
                                    {q.alegra_estimate_number && (
                                        <Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-300 dark:border-green-800">
                                            Alegra N° {q.alegra_estimate_number}
                                        </Badge>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setPendingId(q.id)
                                    }}
                                >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                    {quotes.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                No hay presupuestos todavía. Creá uno con el botón de arriba.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            <ConfirmDialog
                open={pendingId != null}
                onOpenChange={(o) => !o && setPendingId(null)}
                title="Eliminar presupuesto"
                description="Esta acción no se puede deshacer. ¿Querés eliminar este presupuesto?"
                confirmLabel="Eliminar"
                destructive
                loading={deleting}
                onConfirm={doDelete}
            />
        </div>
    )
}
