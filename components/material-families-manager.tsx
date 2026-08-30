"use client"

// Familias de materiales: "Tira LED varía según el color; cálido es este material
// del inventario y azul este otro". Se declara UNA VEZ acá y las hojas de costo la
// eligen como si fuera un material, sin recargar el mapeo producto por producto.
//
// El orden de la pantalla es el orden en que se piensa: primero el nombre general
// de la materia prima, después según qué varía, y recién ahí qué material sale
// para cada valor.

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { formatArs } from "@/lib/format"
import { getMaterialsCatalog } from "@/lib/budget-actions"
import { saveMaterialFamily, deleteMaterialFamily } from "@/lib/material-families"
import type { MaterialFamily } from "@/lib/material-family"
import { MaterialLineAutocomplete, type MaterialSearchResult } from "@/components/material-line-autocomplete"
import type { SpecFieldChoice } from "@/lib/spec-choices"

// Una fila del formulario: un valor del vocabulario (cálido, azul, …) y qué
// material del inventario le corresponde. Sin material = la familia no la mapea;
// no se guarda y un pedido de ese valor cae en la variante predeterminada y queda
// marcado para revisión, igual que hoy.
interface DraftOption {
    specValue: string
    materialId: number | null
    label: string
    unitCost: number
}

interface Draft {
    id: number | null
    name: string
    fieldKey: string
    options: DraftOption[]
    defaultSpecValue: string | null
}

const emptyDraft: Draft = { id: null, name: "", fieldKey: "", options: [], defaultSpecValue: null }

export function MaterialFamiliesManager({
    families,
    specFields,
}: {
    families: MaterialFamily[]
    specFields: SpecFieldChoice[]
}) {
    const router = useRouter()
    const { toast } = useToast()

    const [draft, setDraft] = useState<Draft | null>(null)
    const [saving, setSaving] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<MaterialFamily | null>(null)
    const [deleting, setDeleting] = useState(false)

    // Mismo catálogo en cliente que el editor de costos: pocas familias, muchos
    // materiales, y el filtrado difuso ya está resuelto en el buscador de línea.
    const [catalog, setCatalog] = useState<MaterialSearchResult[]>([])
    useEffect(() => {
        void getMaterialsCatalog().then(({ materials }) => {
            setCatalog((materials as MaterialSearchResult[]).map((m) => ({ ...m, unit_cost: Number(m.unit_cost) })))
        })
    }, [])

    const fieldOf = (key: string) => specFields.find((f) => f.key === key)
    const fieldLabel = (key: string) => fieldOf(key)?.label ?? key
    const valueLabel = (key: string, value: string) =>
        fieldOf(key)?.options.find((o) => o.value === value)?.label ?? value

    // Al elegir el campo se listan TODAS sus opciones como filas vacías. Es la
    // diferencia con cargarlas de a una: se ve de entrada qué falta mapear, y lo
    // que quede vacío simplemente no se guarda.
    const setField = (key: string) => {
        setDraft((d) =>
            d === null
                ? d
                : {
                      ...d,
                      fieldKey: key,
                      defaultSpecValue: null,
                      options: (fieldOf(key)?.options ?? []).map((o) => ({
                          specValue: o.value,
                          materialId: null,
                          label: "",
                          unitCost: 0,
                      })),
                  },
        )
    }

    const openNew = () => setDraft({ ...emptyDraft })

    const openEdit = (f: MaterialFamily) => {
        // Se muestran todas las opciones del campo, con lo ya mapeado adentro: así
        // agregar un color nuevo es escribir en la fila que ya está, no acordarse
        // de que el color existe.
        const mapped = new Map(f.options.map((o) => [o.specValue, o]))
        const all = fieldOf(f.specFieldKey)?.options ?? []
        const rows: DraftOption[] = all.map((o) => {
            const hit = mapped.get(o.value)
            return {
                specValue: o.value,
                materialId: hit?.materialId ?? null,
                label: hit?.label ?? "",
                unitCost: hit?.unitCost ?? 0,
            }
        })
        // Valores mapeados que ya no están en el vocabulario: se muestran igual
        // para poder verlos y sacarlos, en vez de borrarlos por la espalda.
        for (const o of f.options) {
            if (!all.some((a) => a.value === o.specValue)) {
                rows.push({ specValue: o.specValue, materialId: o.materialId, label: o.label, unitCost: o.unitCost })
            }
        }
        setDraft({
            id: f.id,
            name: f.name,
            fieldKey: f.specFieldKey,
            options: rows,
            defaultSpecValue: f.defaultSpecValue,
        })
    }

    const updateRow = (specValue: string, patch: Partial<DraftOption>) => {
        setDraft((d) =>
            d === null
                ? d
                : {
                      ...d,
                      options: d.options.map((o) => (o.specValue === specValue ? { ...o, ...patch } : o)),
                  },
        )
    }

    // La primera variante que se carga queda de predeterminada sola: en la enorme
    // mayoría de los casos es la correcta y evita un click que nadie entiende
    // hasta que le falla el guardado.
    const pickRowMaterial = (specValue: string, m: MaterialSearchResult) => {
        setDraft((d) => {
            if (d === null) return d
            const options = d.options.map((o) =>
                o.specValue === specValue
                    ? { ...o, materialId: m.id, label: m.name, unitCost: Number(m.unit_cost) }
                    : o,
            )
            const hadDefault = d.defaultSpecValue !== null && options.some((o) => o.specValue === d.defaultSpecValue && o.materialId !== null)
            return { ...d, options, defaultSpecValue: hadDefault ? d.defaultSpecValue : specValue }
        })
    }

    const clearRow = (specValue: string) => {
        setDraft((d) => {
            if (d === null) return d
            const options = d.options.map((o) =>
                o.specValue === specValue ? { ...o, materialId: null, label: "", unitCost: 0 } : o,
            )
            const next = d.defaultSpecValue === specValue ? options.find((o) => o.materialId !== null)?.specValue ?? null : d.defaultSpecValue
            return { ...d, options, defaultSpecValue: next }
        })
    }

    const onSave = async () => {
        if (draft === null) return
        const filled = draft.options.filter((o) => o.materialId !== null)
        // Se avisa acá lo mismo que valida el servidor, para no tener que apretar
        // guardar dos veces para enterarse.
        if (!draft.name.trim()) {
            toast.error("Falta el nombre", { description: "Poné el nombre general de la materia prima, por ejemplo “Tira LED”." })
            return
        }
        if (!draft.fieldKey) {
            toast.error("Falta el campo", { description: "Elegí según qué varía la familia (color, óptica, grampa…)." })
            return
        }
        if (filled.length === 0) {
            toast.error("Sin variantes", { description: "Cargá al menos un material para una de las variantes." })
            return
        }

        setSaving(true)
        const result = await saveMaterialFamily(draft.id, {
            name: draft.name,
            spec_field_key: draft.fieldKey,
            default_spec_value: draft.defaultSpecValue,
            options: filled.map((o) => ({ spec_value: o.specValue, material_id: o.materialId as number })),
        })
        setSaving(false)

        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        toast.success(draft.id === null ? "Familia creada" : "Familia actualizada", {
            description: `${draft.name.trim()} · ${filled.length} ${filled.length === 1 ? "variante" : "variantes"}.`,
        })
        setDraft(null)
        router.refresh()
    }

    const onDelete = async () => {
        if (pendingDelete === null) return
        setDeleting(true)
        const result = await deleteMaterialFamily(pendingDelete.id)
        setDeleting(false)
        setPendingDelete(null)

        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        toast.success("Familia eliminada", {
            description:
                result.unlinked && result.unlinked > 0
                    ? `${result.unlinked} línea(s) de hojas de costo quedaron con su último mapeo, para editar a mano.`
                    : undefined,
        })
        router.refresh()
    }

    if (specFields.length === 0) {
        return (
            <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Todavía no hay campos de variación cargados. Cargá el vocabulario en{" "}
                <Link href="/pedidos/opciones" className="underline">
                    opciones de pedidos
                </Link>{" "}
                (color de LED, óptica, grampa…) y volvé para armar las familias.
            </p>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={openNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva familia
                </Button>
            </div>

            {families.length === 0 ? (
                <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                    No hay familias todavía. Creá la primera con el nombre general de la materia prima —“Tira LED”,
                    “Óptica”, “Grampa”— y asociá cada variante al material del inventario que le corresponde.
                </p>
            ) : (
                <div className="space-y-2">
                    {families.map((f) => (
                        <div key={f.id} className="rounded-md border p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="flex items-center gap-1.5 font-medium">
                                        <Layers className="h-4 w-4 shrink-0 text-primary" />
                                        <span className="truncate">{f.name}</span>
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Varía según {fieldLabel(f.specFieldKey)} · {f.options.length}{" "}
                                        {f.options.length === 1 ? "variante" : "variantes"}
                                        {f.defaultSpecValue === null && " · falta elegir con cuál se costea"}
                                    </p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(f)} title="Editar">
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setPendingDelete(f)} title="Eliminar">
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                            {f.options.length > 0 && (
                                <div className="mt-2 space-y-1 border-t pt-2">
                                    {f.options.map((o) => (
                                        <div key={o.specValue} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-xs">
                                            <span className="truncate text-muted-foreground">
                                                {valueLabel(f.specFieldKey, o.specValue)}
                                            </span>
                                            <span className="truncate">{o.label}</span>
                                            <span className="whitespace-nowrap text-muted-foreground">
                                                {formatArs(o.unitCost)}
                                                {o.specValue === f.defaultSpecValue && " · se costea con esta"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{draft?.id === null ? "Nueva familia de materiales" : "Editar familia"}</DialogTitle>
                    </DialogHeader>

                    {draft !== null && (
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="family-name">Nombre general de la materia prima *</Label>
                                <Input
                                    id="family-name"
                                    value={draft.name}
                                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                    placeholder="Tira LED"
                                    autoComplete="off"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Así se va a llamar la línea en las hojas de costo. Sin el color ni la medida: eso son
                                    las variantes.
                                </p>
                            </div>

                            <div>
                                <Label>Varía según *</Label>
                                <Select value={draft.fieldKey} onValueChange={setField}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Elegí el campo (color, óptica, grampa…)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {specFields.map((f) => (
                                            <SelectItem key={f.key} value={f.key}>
                                                {f.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {draft.fieldKey !== "" && (
                                <div className="space-y-2">
                                    <Label>Qué material sale para cada variante</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Dejá vacías las que no uses. La marcada como predeterminada es la que define el
                                        costo en las hojas de costo y la que sale cuando el pedido no aclara.
                                    </p>
                                    {draft.options.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            Ese campo no tiene opciones cargadas. Agregalas en{" "}
                                            <Link href="/pedidos/opciones" className="underline">
                                                opciones de pedidos
                                            </Link>
                                            .
                                        </p>
                                    ) : (
                                        draft.options.map((o) => (
                                            <div
                                                key={o.specValue}
                                                className="grid grid-cols-[100px_1fr_auto] items-center gap-2"
                                            >
                                                <span className="truncate text-sm text-muted-foreground">
                                                    {valueLabel(draft.fieldKey, o.specValue)}
                                                </span>
                                                <MaterialLineAutocomplete
                                                    value={o.label}
                                                    catalog={catalog}
                                                    linked={o.materialId !== null}
                                                    onPick={(m) => pickRowMaterial(o.specValue, m)}
                                                    onText={(t) => updateRow(o.specValue, { materialId: null, label: t })}
                                                />
                                                <div className="flex items-center gap-1">
                                                    <label
                                                        className={`flex items-center gap-1 whitespace-nowrap text-xs ${
                                                            o.materialId === null ? "text-muted-foreground/50" : "text-muted-foreground"
                                                        }`}
                                                        title="Con esta variante se costea"
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="family-default"
                                                            disabled={o.materialId === null}
                                                            checked={draft.defaultSpecValue === o.specValue}
                                                            onChange={() => setDraft({ ...draft, defaultSpecValue: o.specValue })}
                                                        />
                                                        costea
                                                    </label>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        disabled={o.materialId === null && o.label === ""}
                                                        onClick={() => clearRow(o.specValue)}
                                                        title="Vaciar esta variante"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
                                    Cancelar
                                </Button>
                                <Button onClick={onSave} disabled={saving}>
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Guardar familia
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={pendingDelete !== null}
                onOpenChange={(open) => !open && setPendingDelete(null)}
                title={`¿Eliminar la familia "${pendingDelete?.name ?? ""}"?`}
                description="Las hojas de costo que la usaban se quedan con el último mapeo cargado y pasan a editarse a mano. No se borra ningún material del inventario."
                confirmLabel="Eliminar"
                destructive
                loading={deleting}
                onConfirm={onDelete}
            />
        </div>
    )
}
