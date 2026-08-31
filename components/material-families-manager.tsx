"use client"

// Familias de materiales: "Placa 1 led varía según el color; 2200k puede ser este
// material o este otro". Se declara UNA VEZ acá y las hojas de costo la eligen
// como si fuera un material, sin recargar el mapeo producto por producto.
//
// El orden de la pantalla es el orden en que se piensa: primero el nombre general
// de la materia prima, después según qué varía, y recién ahí qué materiales salen
// para cada valor.

import { useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ChevronDown, Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { formatArs } from "@/lib/format"
import { getMaterialsCatalog } from "@/lib/budget-actions"
import { saveMaterialFamily, deleteMaterialFamily } from "@/lib/material-families"
import { familyUnitCost, type CostStrategy, type MaterialFamily } from "@/lib/material-family"
import { MaterialLineAutocomplete, type MaterialSearchResult } from "@/components/material-line-autocomplete"
import type { SpecFieldChoice } from "@/lib/spec-choices"

// Una fila del formulario. Un mismo valor de spec puede tener varias filas (varios
// materiales para un color). El default de cada color es el primer material cargado.
interface DraftOption {
    key: string
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
    costStrategy: CostStrategy
    costMaterialId: number | null
}

const emptyDraft: Draft = {
    id: null,
    name: "",
    fieldKey: "",
    options: [],
    defaultSpecValue: null,
    costStrategy: "default",
    costMaterialId: null,
}

let nextKey = 1
const newKey = () => String(nextKey++)

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
    const costStrategyLabel = (strategy: CostStrategy) => {
        switch (strategy) {
            case "average":
                return "promedio"
            case "highest":
                return "más caro"
            case "specific":
                return "material específico"
            case "default":
                return "default"
        }
    }

    // Agrupa las filas de borrador por specValue, respetando el orden de carga.
    const groupBySpecValue = <T extends { specValue: string }>(options: T[]) => {
        const groups = new Map<string, T[]>()
        for (const o of options) {
            const list = groups.get(o.specValue) ?? []
            list.push(o)
            groups.set(o.specValue, list)
        }
        return groups
    }

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
                          key: newKey(),
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
        const mapped = groupBySpecValue(f.options)
        const all = fieldOf(f.specFieldKey)?.options ?? []
        const rows: DraftOption[] = []
        for (const opt of all) {
            const hits = mapped.get(opt.value)
            if (hits && hits.length > 0) {
                for (const h of hits) {
                    rows.push({
                        key: newKey(),
                        specValue: opt.value,
                        materialId: h.materialId,
                        label: h.label,
                        unitCost: h.unitCost,
                    })
                }
            } else {
                rows.push({
                    key: newKey(),
                    specValue: opt.value,
                    materialId: null,
                    label: "",
                    unitCost: 0,
                })
            }
        }
        // Valores mapeados que ya no están en el vocabulario: se muestran igual
        // para poder verlos y sacarlos, en vez de borrarlos por la espalda.
        for (const o of f.options) {
            if (!all.some((a) => a.value === o.specValue)) {
                rows.push({
                    key: newKey(),
                    specValue: o.specValue,
                    materialId: o.materialId,
                    label: o.label,
                    unitCost: o.unitCost,
                })
            }
        }
        setDraft({
            id: f.id,
            name: f.name,
            fieldKey: f.specFieldKey,
            options: rows,
            defaultSpecValue: f.defaultSpecValue,
            costStrategy: f.costStrategy,
            costMaterialId: f.costMaterialId,
        })
    }

    const updateRow = (key: string, patch: Partial<DraftOption>) => {
        setDraft((d) =>
            d === null
                ? d
                : {
                      ...d,
                      options: d.options.map((o) => (o.key === key ? { ...o, ...patch } : o)),
                  },
        )
    }

    const addMaterialToSpec = (specValue: string) => {
        setDraft((d) => {
            if (d === null) return d
            return {
                ...d,
                options: [
                    ...d.options,
                    {
                        key: newKey(),
                        specValue,
                        materialId: null,
                        label: "",
                        unitCost: 0,
                    },
                ],
            }
        })
    }

    const removeRow = (key: string) => {
        setDraft((d) => {
            if (d === null) return d
            return { ...d, options: d.options.filter((o) => o.key !== key) }
        })
    }

    const pickRowMaterial = (key: string, m: MaterialSearchResult) => {
        setDraft((d) => {
            if (d === null) return d
            const target = d.options.find((o) => o.key === key)
            if (!target) return d
            const options = d.options.map((o) =>
                o.key === key ? { ...o, materialId: m.id, label: m.name, unitCost: Number(m.unit_cost) } : o,
            )
            const hadDefault =
                d.defaultSpecValue !== null &&
                options.some((o) => o.specValue === d.defaultSpecValue && o.materialId !== null)
            return { ...d, options, defaultSpecValue: hadDefault ? d.defaultSpecValue : target.specValue }
        })
    }

    const clearRow = (key: string) => {
        setDraft((d) => {
            if (d === null) return d
            const target = d.options.find((o) => o.key === key)
            if (!target) return d
            const options = d.options.map((o) =>
                o.key === key ? { ...o, materialId: null, label: "", unitCost: 0 } : o,
            )
            const sameSpecWithMaterial = options.filter((o) => o.specValue === target.specValue && o.materialId !== null)
            const next =
                d.defaultSpecValue === target.specValue
                    ? sameSpecWithMaterial[0]?.specValue ?? null
                    : d.defaultSpecValue
            return { ...d, options, defaultSpecValue: next }
        })
    }

    const onSave = async () => {
        if (draft === null) return
        const filled = draft.options.filter((o) => o.materialId !== null)
        // Se avisa acá lo mismo que valida el servidor, para no tener que apretar
        // guardar dos veces para enterarse.
        if (!draft.name.trim()) {
            toast.error("Falta el nombre", { description: "Poné el nombre general de la materia prima, por ejemplo “Placa 1 led”." })
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

        // El primer material cargado de cada color es el default (costeo/BOM).
        const bySpec = groupBySpecValue(filled)
        const defaultKeys = new Set<string>()
        for (const [, list] of bySpec) {
            defaultKeys.add(list[0].key)
        }

        setSaving(true)
        const result = await saveMaterialFamily(draft.id, {
            name: draft.name,
            spec_field_key: draft.fieldKey,
            default_spec_value: draft.defaultSpecValue,
            cost_strategy: draft.costStrategy,
            cost_material_id: draft.costMaterialId,
            options: filled.map((o) => ({
                spec_value: o.specValue,
                material_id: o.materialId as number,
                is_default: defaultKeys.has(o.key),
            })),
        })
        setSaving(false)

        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        toast.success(draft.id === null ? "Familia creada" : "Familia actualizada", {
            description: `${draft.name.trim()} · ${filled.length} ${filled.length === 1 ? "material" : "materiales"} en ${bySpec.size} ${bySpec.size === 1 ? "variante" : "variantes"}.`,
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
                    No hay familias todavía. Creá la primera con el nombre general de la materia prima —“Placa 1 led”,
                    “Óptica individual”, “Grampa”— y asociá cada variante al material del inventario que le
                    corresponde. Un mismo color puede tener varios materiales.
                </p>
            ) : (
                <div className="space-y-2">
                    {families.map((f) => {
                        const specCount = new Set(f.options.map((o) => o.specValue)).size
                        return (
                            <details key={f.id} className="group rounded-md border p-3">
                                <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
                                    <div className="flex min-w-0 flex-1 items-start gap-2">
                                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-1.5 font-medium">
                                                <Layers className="h-4 w-4 shrink-0 text-primary" />
                                                <span className="truncate">{f.name}</span>
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                Varía según {fieldLabel(f.specFieldKey)} · {specCount}{" "}
                                                {specCount === 1 ? "variante" : "variantes"} · {f.options.length}{" "}
                                                {f.options.length === 1 ? "material" : "materiales"}
                                                {f.defaultSpecValue === null && " · falta elegir con cuál se calcula el costo"}
                                                {f.defaultSpecValue !== null && ` · ${formatArs(familyUnitCost(f))}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-1" onClick={(e) => e.preventDefault()}>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(f)} title="Editar">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => setPendingDelete(f)} title="Eliminar">
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </summary>
                                {f.options.length > 0 && (
                                    <div className="mt-2 space-y-1 border-t pt-2">
                                        {f.defaultSpecValue !== null && (
                                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                                                Costo · {costStrategyLabel(f.costStrategy)} · {formatArs(familyUnitCost(f))}
                                            </p>
                                        )}
                                        {f.options.map((o) => (
                                            <div key={`${o.specValue}-${o.materialId}`} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-xs">
                                                <span className="truncate text-muted-foreground">
                                                    {valueLabel(f.specFieldKey, o.specValue)}
                                                </span>
                                                <span className="truncate">{o.label}</span>
                                                <span className="flex items-center gap-2 whitespace-nowrap text-muted-foreground">
                                                    {((f.costStrategy === "default" &&
                                                        o.isDefault &&
                                                        o.specValue === f.defaultSpecValue) ||
                                                        (f.costStrategy === "specific" &&
                                                            o.materialId === f.costMaterialId)) && (
                                                        <Badge variant="secondary">Costeo</Badge>
                                                    )}
                                                    {formatArs(o.unitCost)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </details>
                        )
                    })}
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
                                    placeholder="Placa 1 led"
                                    autoComplete="off"
                                />

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
                                    {draft.options.length > 0 && (
                                        <>
                                            <Label>Cómo se calcula el costo</Label>
                                            <Select
                                                value={draft.costStrategy}
                                                onValueChange={(v) =>
                                                    setDraft({
                                                        ...draft,
                                                        costStrategy: v as CostStrategy,
                                                        costMaterialId:
                                                            v === "specific" ? draft.costMaterialId : null,
                                                    })
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Elegí cálculo" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="default">Default</SelectItem>
                                                    <SelectItem value="average">Promedio de todos los materiales</SelectItem>
                                                    <SelectItem value="highest">Material más caro</SelectItem>
                                                    <SelectItem value="specific">Material específico</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            {draft.costStrategy === "specific" && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Material para costear</p>
                                                    <Select
                                                        value={draft.costMaterialId ? String(draft.costMaterialId) : ""}
                                                        onValueChange={(v) =>
                                                            setDraft({ ...draft, costMaterialId: Number(v) })
                                                        }
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Elegí material" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {draft.options
                                                                .filter((o) => o.materialId !== null)
                                                                .map((o) => (
                                                                    <SelectItem
                                                                        key={o.materialId}
                                                                        value={String(o.materialId)}
                                                                    >
                                                                        {o.label}
                                                                    </SelectItem>
                                                                ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <Label className={draft.options.length > 0 ? "pt-2" : undefined}>
                                        Qué material sale para cada variante
                                    </Label>
                                    {draft.options.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            Ese campo no tiene opciones cargadas. Agregalas en{" "}
                                            <Link href="/pedidos/opciones" className="underline">
                                                opciones de pedidos
                                            </Link>
                                            .
                                        </p>
                                    ) : (
                                        <>
                                            {/* La pregunta se hace UNA vez arriba de la columna: repetirla en cada
                                                fila obliga a una etiqueta corta que no se entiende sola. */}
                                            {Array.from(groupBySpecValue(draft.options).entries()).map(([specValue, rows]) => {
                                                const specLabel = valueLabel(draft.fieldKey, specValue)
                                                return (
                                                <div key={specValue} className="space-y-1 rounded-md border p-2">
                                                    <p className="text-xs font-medium text-muted-foreground">
                                                        {specLabel}
                                                    </p>
                                                    {rows.map((o) => (
                                                        <div
                                                            key={o.key}
                                                            className="grid grid-cols-[1fr_auto] items-center gap-2"
                                                        >
                                                            <MaterialLineAutocomplete
                                                                value={o.label}
                                                                catalog={catalog}
                                                                linked={o.materialId !== null}
                                                                onPick={(m) => pickRowMaterial(o.key, m)}
                                                                onText={(t) => updateRow(o.key, { materialId: null, label: t })}
                                                            />
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
                                                                disabled={o.materialId === null && o.label === ""}
                                                                onClick={() => clearRow(o.key)}
                                                                title="Vaciar esta opción"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                                                        onClick={() => addMaterialToSpec(specValue)}
                                                    >
                                                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                                                        Agregar otro material
                                                    </Button>
                                                </div>
                                                )
                                            })}

                                            <div className="space-y-1 pt-1">
                                                <p className="text-xs text-muted-foreground">
                                                    Variante que sale por defecto al retirar stock
                                                </p>
                                                <Select
                                                    value={draft.defaultSpecValue ?? ""}
                                                    onValueChange={(v) =>
                                                        setDraft({ ...draft, defaultSpecValue: v || null })
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Elegí variante" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Array.from(groupBySpecValue(draft.options)
                                                            .entries())
                                                            .filter(([, rows]) => rows.some((r) => r.materialId !== null))
                                                            .map(([specValue]) => (
                                                                <SelectItem key={specValue} value={specValue}>
                                                                    {valueLabel(draft.fieldKey, specValue)}
                                                                </SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </>
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
