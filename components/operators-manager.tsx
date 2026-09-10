"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Plus, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { createOperator, renameOperator, setOperatorActive } from "@/lib/operators-actions"
import type { Operator } from "@/lib/operators-types"

// La lista de gente del depósito. No hay borrado en toda la pantalla: un
// operario borrado deja movimientos firmados por nadie. Se desactiva, y con eso
// desaparece del modal de entrada/salida pero sigue nombrado en el histórico.
export function OperatorsManager({ operators }: { operators: Operator[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [nombre, setNombre] = useState("")
    const [creando, setCreando] = useState(false)
    const [pendiente, setPendiente] = useState<number | null>(null)
    const [editando, setEditando] = useState<Operator | null>(null)
    const [nombreEditado, setNombreEditado] = useState("")

    const activos = operators.filter((o) => o.active)
    const inactivos = operators.filter((o) => !o.active)

    async function agregar(e: React.FormEvent) {
        e.preventDefault()
        if (!nombre.trim()) return
        setCreando(true)
        const r = await createOperator(nombre)
        setCreando(false)
        if ("error" in r && r.error) {
            toast("No se pudo agregar", { description: r.error })
            return
        }
        setNombre("")
        router.refresh()
    }

    async function cambiarEstado(op: Operator) {
        setPendiente(op.id)
        const r = await setOperatorActive(op.id, !op.active)
        setPendiente(null)
        if ("error" in r && r.error) {
            toast("No se pudo cambiar", { description: r.error })
            return
        }
        router.refresh()
    }

    async function guardarNombre(e: React.FormEvent) {
        e.preventDefault()
        if (!editando) return
        setPendiente(editando.id)
        const r = await renameOperator(editando.id, nombreEditado)
        setPendiente(null)
        if ("error" in r && r.error) {
            toast("No se pudo renombrar", { description: r.error })
            return
        }
        setEditando(null)
        router.refresh()
    }

    return (
        <div className="space-y-8">
            <form onSubmit={agregar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                    <Label htmlFor="nuevo-operario">Nombre del operario</Label>
                    <Input
                        id="nuevo-operario"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej: Juan Pérez"
                        maxLength={100}
                        autoComplete="off"
                    />
                </div>
                <Button type="submit" disabled={creando || !nombre.trim()}>
                    {creando ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Plus className="mr-2 h-4 w-4" />
                    )}
                    Agregar
                </Button>
            </form>

            <section className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                    En la lista ({activos.length})
                </h2>
                {activos.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Todavía no hay operarios. Agregá al menos uno para que el modal de entrada y
                        salida pueda preguntar quién movió el material.
                    </p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {activos.map((op) => (
                            <li key={op.id} className="flex items-center gap-3 p-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                                    <UserRound className="h-4 w-4" />
                                </span>
                                <span className="flex-1 font-medium">{op.name}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Renombrar a ${op.name}`}
                                    onClick={() => {
                                        setEditando(op)
                                        setNombreEditado(op.name)
                                    }}
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pendiente === op.id}
                                    onClick={() => cambiarEstado(op)}
                                >
                                    {pendiente === op.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Dar de baja"
                                    )}
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {inactivos.length > 0 && (
                <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground">
                        Dados de baja ({inactivos.length})
                    </h2>
                    {/* Siguen acá y no se borran: los movimientos que firmaron
                        conservan su nombre, y si vuelve al depósito se reactiva. */}
                    <ul className="divide-y rounded-lg border">
                        {inactivos.map((op) => (
                            <li key={op.id} className="flex items-center gap-3 p-3">
                                <span className="flex-1 text-muted-foreground">{op.name}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pendiente === op.id}
                                    onClick={() => cambiarEstado(op)}
                                >
                                    {pendiente === op.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Reactivar"
                                    )}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <Dialog open={editando != null} onOpenChange={(o) => !o && setEditando(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Renombrar operario</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={guardarNombre} className="space-y-4">
                        <Input
                            value={nombreEditado}
                            onChange={(e) => setNombreEditado(e.target.value)}
                            maxLength={100}
                            autoFocus
                        />
                        <p className="text-xs text-muted-foreground">
                            Los movimientos ya registrados conservan el nombre con el que se
                            firmaron.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={pendiente === editando?.id}>
                                Guardar
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
