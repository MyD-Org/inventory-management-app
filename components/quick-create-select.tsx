"use client"

// Select de catálogo (categorías, proveedores) con un botón "+" al lado que permite
// dar de alta la opción sin salir del formulario: cargar un material no debería
// obligar a irse a Configuración y volver a empezar.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

export interface Option {
    id: number
    name: string
}

export function QuickCreateSelect({
    value,
    onChange,
    options,
    onCreated,
    placeholder,
    dialogTitle,
    dialogDescription,
    namePlaceholder,
    extraLabel,
    extraPlaceholder,
    onCreate,
    emptyHint,
    loading = false,
    error = false,
}: {
    value: string
    onChange: (value: string) => void
    options: Option[]
    onCreated: (option: Option) => void
    placeholder: string
    dialogTitle: string
    dialogDescription: string
    namePlaceholder: string
    extraLabel: string
    extraPlaceholder: string
    onCreate: (formData: FormData) => Promise<{ error?: string; created?: Option }>
    emptyHint: string
    loading?: boolean
    error?: boolean
}) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [name, setName] = useState("")
    const [extra, setExtra] = useState("")

    async function handleCreate() {
        if (!name.trim()) return
        setSaving(true)
        const formData = new FormData()
        formData.set("name", name.trim())
        // El campo extra cambia según el catálogo (descripción / contacto).
        formData.set(extraLabel === "Descripción" ? "description" : "contact_info", extra.trim())

        const result = await onCreate(formData)
        setSaving(false)

        if (result.error || !result.created) {
            toast.error("Error", { description: result.error ?? "No se pudo crear" })
            return
        }

        onCreated(result.created)
        onChange(result.created.id.toString())
        setName("")
        setExtra("")
        setOpen(false)
    }

    return (
        <>
            <div className="flex gap-2">
                <Select value={value} onValueChange={onChange} disabled={loading}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={loading ? "Cargando..." : placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id.toString()}>
                                {opt.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    title={dialogTitle}
                    onClick={() => setOpen(true)}
                >
                    <Plus className="w-4 h-4" />
                </Button>
            </div>

            {error ? (
                // Ya se reintentó solo varias veces: acá no hay nada que el
                // usuario pueda tocar, solo se le dice qué pasa.
                <p className="text-xs text-destructive">
                    No se pudo cargar la lista. Volvé a entrar en un rato.
                </p>
            ) : (
                !loading && options.length === 0 && (
                    <p className="text-xs text-muted-foreground">{emptyHint}</p>
                )
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{dialogTitle}</DialogTitle>
                        <DialogDescription>{dialogDescription}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="quick-create-name">Nombre *</Label>
                            <Input
                                id="quick-create-name"
                                autoFocus
                                placeholder={namePlaceholder}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault()
                                        handleCreate()
                                    }
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="quick-create-extra">{extraLabel}</Label>
                            <Input
                                id="quick-create-extra"
                                placeholder={extraPlaceholder}
                                value={extra}
                                onChange={(e) => setExtra(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="button" onClick={handleCreate} disabled={saving || !name.trim()}>
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Crear y seleccionar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
