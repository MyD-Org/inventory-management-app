"use client"

// Editor del vocabulario de variaciones de producto. Se monta en
// /settings/variaciones —configuración del inventario— y lo consumen tres lugares:
// las familias de materiales, las fichas de producto y el bot del CRM
// (GET /api/specs).
//
// Las opciones se DESACTIVAN en vez de borrarse: salen de la lista que ve el bot
// pero los pedidos históricos que las usaron siguen siendo legibles.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Loader2, Eye, EyeOff, X, Trash2 } from "lucide-react"
import {
    createSpecField,
    createSpecOption,
    deleteSpecField,
    deleteSpecOption,
    toggleSpecField,
    toggleSpecOption,
} from "@/lib/order-actions"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useToast } from "@/hooks/use-toast"

export interface SpecOptionRow {
    id: number
    value: string
    label: string
    active: boolean
}

export interface SpecFieldRow {
    key: string
    label: string
    free_text: boolean
    kind: "list" | "text" | "boolean"
    active: boolean
    options: SpecOptionRow[]
}

export function SpecsManager({ fields }: { fields: SpecFieldRow[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [busy, setBusy] = useState(false)
    const [newFieldOpen, setNewFieldOpen] = useState(false)
    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [borrarOpcion, setBorrarOpcion] = useState<{ id: number; label: string } | null>(null)
    const [borrarCampo, setBorrarCampo] = useState<{ key: string; label: string } | null>(null)

    async function run(fn: () => Promise<{ error?: string }>, okMsg: string) {
        setBusy(true)
        const result = await fn()
        setBusy(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return false
        }
        toast.success(okMsg)
        router.refresh()
        return true
    }

    async function addOption(fieldKey: string) {
        const value = (drafts[fieldKey] ?? "").trim()
        if (!value) return
        const ok = await run(() => createSpecOption(fieldKey, value, value), "Opción agregada")
        if (ok) setDrafts((d) => ({ ...d, [fieldKey]: "" }))
    }

    async function addField(formData: FormData) {
        const ok = await run(
            () => createSpecField(String(formData.get("key") ?? ""), String(formData.get("label") ?? "")),
            "Campo creado",
        )
        if (ok) setNewFieldOpen(false)
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Dialog open={newFieldOpen} onOpenChange={setNewFieldOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline">
                            <Plus className="mr-2 h-4 w-4" />
                            Nuevo campo
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Nuevo campo de pedido</DialogTitle>
                        </DialogHeader>
                        <form action={addField} className="space-y-4">
                            <div>
                                <Label htmlFor="key">Clave</Label>
                                <Input id="key" name="key" placeholder="ej: acabado" required />
                                <p className="text-sm text-muted-foreground mt-1">
                                    Es el nombre que manda el CRM. Si cambiás una clave existente hay que
                                    avisar del otro lado o deja de coincidir.
                                </p>
                            </div>
                            <div>
                                <Label htmlFor="label">Etiqueta</Label>
                                <Input id="label" name="label" placeholder="ej: Acabado" required />
                            </div>
                            <Button type="submit" disabled={busy} className="w-full">
                                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Crear
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {fields.length === 0 && (
                <p className="text-base text-muted-foreground py-8 text-center">
                    No hay campos cargados. El asistente no va a poder tomar especificaciones.
                </p>
            )}

            {fields.map((field) => (
                <div key={field.key} className={`rounded-md border p-4 ${field.active ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                            <h2 className="font-semibold">{field.label}</h2>
                            <code className="text-sm text-muted-foreground">{field.key}</code>
                            {field.kind === "text" && (
                                <Badge variant="outline" className="ml-2">Texto libre</Badge>
                            )}
                            {field.kind === "boolean" && (
                                <Badge variant="outline" className="ml-2">Sí / No</Badge>
                            )}
                        </div>

                        {/* Las dos acciones juntas a la derecha, y la destructiva
                            al final: si no, el tacho quedaba suelto en el medio. */}
                        <div className="flex items-center gap-1 shrink-0">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                title={
                                    field.active
                                        ? "El asistente lo está ofreciendo"
                                        : "Oculto para el asistente"
                                }
                                onClick={() =>
                                    run(
                                        () => toggleSpecField(field.key, !field.active),
                                        field.active ? "Campo oculto para el asistente" : "Campo visible",
                                    )
                                }
                            >
                                {field.active ? (
                                    <><Eye className="mr-2 h-4 w-4" />Visible</>
                                ) : (
                                    <><EyeOff className="mr-2 h-4 w-4" />Oculto</>
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={busy}
                                title="Borrar el campo y todas sus opciones"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => setBorrarCampo({ key: field.key, label: field.label })}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {field.kind === "text" ? (
                        <p className="text-base text-muted-foreground">
                            El asistente escribe acá lo que le pida el cliente. No tiene lista de opciones.
                        </p>
                    ) : field.kind === "boolean" ? (
                        <p className="text-base text-muted-foreground">
                            Se marca o no se marca. Sin marcar vale como
                            {" "}&quot;{field.options.find((o) => o.value === "sin")?.label ?? "No"}&quot;,
                            no como un dato que falta confirmar.
                        </p>
                    ) : (
                    <>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {field.options.length === 0 && (
                            <p className="text-base text-muted-foreground">Sin opciones todavía.</p>
                        )}
                        {field.options.map((o) => (
                            <span
                                key={o.id}
                                className={`group inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-0.5 text-sm ${
                                    o.active ? "bg-secondary" : "line-through opacity-60"
                                }`}
                            >
                                <button
                                    type="button"
                                    disabled={busy}
                                    title={o.active ? "Ocultarla del vocabulario" : "Volver a mostrarla"}
                                    onClick={() =>
                                        run(
                                            () => toggleSpecOption(o.id, !o.active),
                                            o.active ? `"${o.label}" ya no se ofrece` : `"${o.label}" habilitada`,
                                        )
                                    }
                                >
                                    {o.label}
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    title="Borrar la opción"
                                    onClick={() => setBorrarOpcion({ id: o.id, label: o.label })}
                                    className="rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive transition-opacity"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                    </div>

                    <div className="flex gap-2 max-w-sm">
                        <Input
                            placeholder="Agregar opción"
                            value={drafts[field.key] ?? ""}
                            onChange={(e) => setDrafts((d) => ({ ...d, [field.key]: e.target.value }))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault()
                                    addOption(field.key)
                                }
                            }}
                        />
                        <Button variant="secondary" disabled={busy} onClick={() => addOption(field.key)}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    </>
                    )}
                </div>
            ))}

            <ConfirmDialog
                open={borrarOpcion !== null}
                onOpenChange={(o) => !o && setBorrarOpcion(null)}
                title={`Borrar "${borrarOpcion?.label ?? ""}"`}
                description="El asistente deja de ofrecerla. Los pedidos que ya la usaron la siguen mostrando."
                confirmLabel="Borrar"
                destructive
                loading={busy}
                onConfirm={async () => {
                    if (!borrarOpcion) return
                    await run(() => deleteSpecOption(borrarOpcion.id), "Opción borrada")
                    setBorrarOpcion(null)
                }}
            />

            <ConfirmDialog
                open={borrarCampo !== null}
                onOpenChange={(o) => !o && setBorrarCampo(null)}
                title={`Borrar "${borrarCampo?.label ?? ""}"`}
                description="Se borra el campo y todas sus opciones, y deja de ser una columna del pedido. Los pedidos que ya lo usaron lo siguen mostrando."
                confirmLabel="Borrar"
                destructive
                loading={busy}
                onConfirm={async () => {
                    if (!borrarCampo) return
                    await run(() => deleteSpecField(borrarCampo.key), "Campo borrado")
                    setBorrarCampo(null)
                }}
            />
        </div>
    )
}
