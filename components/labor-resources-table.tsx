"use client"

// Recursos de mano de obra: empleados propios, contratistas, talleres externos,
// instaladores o servicios tercerizados. Se cargan con VALOR POR MES; el costo/hora
// derivado (valor mensual ÷ horas laborales del mes) se muestra como referencia y es
// el que usa el editor de costos.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Trash2, Plus, Loader2, Pencil } from "lucide-react"
import { createLaborResource, updateLaborResource, deleteLaborResource } from "@/lib/budget-actions"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { NumericInput } from "@/components/numeric-input"

const round2 = (n: number) => Math.round(n * 100) / 100

interface LaborResource {
    id: number
    name: string
    role: string | null
    monthly_value: number
    active: boolean
}

function formatArs(n: number): string {
    return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}

export function LaborResourcesTable({
    resources,
    workHoursPerMonth,
}: {
    resources: LaborResource[]
    workHoursPerMonth: number
}) {
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<LaborResource | null>(null)
    const [loading, setLoading] = useState(false)
    const [pendingId, setPendingId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)
    const { toast } = useToast()
    const router = useRouter()

    const hourlyOf = (r: LaborResource) => r.monthly_value / workHoursPerMonth

    async function handleCreate(formData: FormData) {
        setLoading(true)
        const result = await createLaborResource(formData)
        setLoading(false)

        if (result.error) {
            toast.error("Error", { description: result.error })
        } else {
            toast.success("Éxito", { description: "Recurso creado correctamente" })
            setOpen(false)
            router.refresh()
        }
    }

    async function handleUpdate(formData: FormData) {
        if (!editing) return
        setLoading(true)
        const result = await updateLaborResource(editing.id, formData)
        setLoading(false)

        if (result.error) {
            toast.error("Error", { description: result.error })
        } else {
            toast.success("Éxito", { description: "Recurso actualizado" })
            setEditing(null)
            router.refresh()
        }
    }

    async function doDelete() {
        if (pendingId == null) return
        setDeleting(true)
        const result = await deleteLaborResource(pendingId)
        setDeleting(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
        } else {
            setPendingId(null)
            toast.success("Éxito", { description: "Recurso eliminado" })
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
                            Nuevo Recurso
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Agregar Recurso</DialogTitle>
                        </DialogHeader>
                        <ResourceForm
                            workHoursPerMonth={workHoursPerMonth}
                            loading={loading}
                            onSubmit={handleCreate}
                            submitLabel="Guardar"
                        />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Recurso</TableHead>
                            <TableHead>Cargo</TableHead>
                            <TableHead>Valor por mes</TableHead>
                            <TableHead>Costo/hora</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {resources.map((r) => (
                            <TableRow key={r.id}>
                                <TableCell className="font-medium">{r.name}</TableCell>
                                <TableCell className="text-muted-foreground">{r.role || "-"}</TableCell>
                                <TableCell>{formatArs(Number(r.monthly_value))}</TableCell>
                                <TableCell className="text-muted-foreground">{formatArs(hourlyOf(r))}/h</TableCell>
                                <TableCell>
                                    <Badge variant={r.active ? "default" : "secondary"}>
                                        {r.active ? "Activo" : "Inactivo"}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setPendingId(r.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {resources.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No hay recursos registrados
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar Recurso</DialogTitle>
                    </DialogHeader>
                    {editing && (
                        <ResourceForm
                            resource={editing}
                            workHoursPerMonth={workHoursPerMonth}
                            loading={loading}
                            onSubmit={handleUpdate}
                            submitLabel="Guardar cambios"
                            showActive
                        />
                    )}
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={pendingId != null}
                onOpenChange={(o) => !o && setPendingId(null)}
                title="Eliminar recurso"
                description="Esta acción no se puede deshacer. ¿Querés eliminar este recurso?"
                confirmLabel="Eliminar"
                destructive
                loading={deleting}
                onConfirm={doDelete}
            />
        </div>
    )
}

// Formulario de recurso con valor por MES y por HORA sincronizados: se carga cualquiera
// de los dos y el otro se recalcula en vivo (base: workHoursPerMonth). La FK del cálculo
// guarda el mensual, así que se envía monthly_value (hidden) al server action.
function ResourceForm({
    resource,
    workHoursPerMonth,
    loading,
    onSubmit,
    submitLabel,
    showActive = false,
}: {
    resource?: LaborResource
    workHoursPerMonth: number
    loading: boolean
    onSubmit: (formData: FormData) => void
    submitLabel: string
    showActive?: boolean
}) {
    const [monthly, setMonthly] = useState<number>(resource ? Number(resource.monthly_value) : 0)
    const [hourly, setHourly] = useState<number>(
        resource ? round2(Number(resource.monthly_value) / workHoursPerMonth) : 0,
    )

    const fromMonthly = (m: number) => {
        setMonthly(m)
        setHourly(round2(m / workHoursPerMonth))
    }
    const fromHourly = (h: number) => {
        setHourly(h)
        setMonthly(round2(h * workHoursPerMonth))
    }

    return (
        <form action={onSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" name="name" defaultValue={resource?.name} placeholder="Ej: Juan Pérez / Taller Norte" required />
            </div>
            <div className="space-y-2">
                <Label htmlFor="role">Cargo (opcional)</Label>
                <Input id="role" name="role" defaultValue={resource?.role ?? ""} placeholder="Ej: Soldador, Armador, Electricista" />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                    <Label>Valor por mes ($)</Label>
                    <NumericInput value={monthly} onChange={fromMonthly} />
                </div>
                <div className="space-y-2">
                    <Label>Valor por hora ($)</Label>
                    <NumericInput value={hourly} onChange={fromHourly} />
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                Cargá el mes o la hora: el otro se calcula solo (base {workHoursPerMonth} hs/mes, L-V 8:00–17:30).
            </p>
            <input type="hidden" name="monthly_value" value={monthly} />

            {showActive && (
                <div className="space-y-2">
                    <Label htmlFor="active">Estado</Label>
                    <select
                        id="active"
                        name="active"
                        defaultValue={resource?.active ? "true" : "false"}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                    </select>
                </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : submitLabel}
            </Button>
        </form>
    )
}
