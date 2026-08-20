"use client"

// Editor del vocabulario que consume el bot del CRM (GET /api/specs).
// Las opciones se DESACTIVAN en vez de borrarse: salen de la lista que ve el bot
// pero los pedidos históricos que las usaron siguen siendo legibles.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Loader2, Eye, EyeOff } from "lucide-react"
import { createSpecField, createSpecOption, toggleSpecField, toggleSpecOption } from "@/lib/order-actions"
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
    active: boolean
    options: SpecOptionRow[]
}

export function SpecsManager({ fields }: { fields: SpecFieldRow[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [busy, setBusy] = useState(false)
    const [newFieldOpen, setNewFieldOpen] = useState(false)
    const [drafts, setDrafts] = useState<Record<string, string>>({})

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
                                <p className="text-xs text-muted-foreground mt-1">
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
                <p className="text-sm text-muted-foreground py-8 text-center">
                    No hay campos cargados. El asistente no va a poder tomar especificaciones.
                </p>
            )}

            {fields.map((field) => (
                <div key={field.key} className={`rounded-md border p-4 ${field.active ? "" : "opacity-60"}`}>
                    <div className="flex items-center justify-between gap-4 mb-3">
                        <div>
                            <h2 className="font-semibold">{field.label}</h2>
                            <code className="text-xs text-muted-foreground">{field.key}</code>
                            {field.free_text && (
                                <Badge variant="outline" className="ml-2">Texto libre</Badge>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
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
                    </div>

                    {field.free_text ? (
                        <p className="text-sm text-muted-foreground">
                            El asistente escribe acá lo que le pida el cliente. No tiene lista de opciones.
                        </p>
                    ) : (
                    <>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {field.options.length === 0 && (
                            <p className="text-sm text-muted-foreground">Sin opciones todavía.</p>
                        )}
                        {field.options.map((o) => (
                            <button
                                key={o.id}
                                type="button"
                                disabled={busy}
                                title={o.active ? "Sacar del vocabulario" : "Volver a habilitar"}
                                onClick={() =>
                                    run(
                                        () => toggleSpecOption(o.id, !o.active),
                                        o.active ? `"${o.value}" ya no se ofrece` : `"${o.value}" habilitada`,
                                    )
                                }
                            >
                                <Badge
                                    variant={o.active ? "secondary" : "outline"}
                                    className={o.active ? "cursor-pointer" : "cursor-pointer line-through opacity-60"}
                                >
                                    {o.label}
                                </Badge>
                            </button>
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
        </div>
    )
}
