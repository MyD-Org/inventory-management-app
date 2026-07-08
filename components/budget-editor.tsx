"use client"

// Editor de cálculo de costos de fabricación: materiales del inventario (costo real) +
// mano de obra (recursos con valor mensual → costo/hora derivado) + otros costos +
// margen de ganancia. Todos los totales se recalculan en vivo.
// Si existe un borrador de la IA en sessionStorage (BUDGET_DRAFT_KEY, lo deja el
// botón "Calcular costo" del chat), se precarga al montar en modo "nuevo".

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Plus, Trash2, RefreshCw, Save, Sparkles } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { NumericInput } from "@/components/numeric-input"
import {
    saveBudget,
    deleteBudget,
    getCurrentCosts,
    getMaterialsCatalog,
    type BudgetPayload,
} from "@/lib/budget-actions"
import { BUDGET_DRAFT_KEY } from "@/components/ai-assistant"
import { ProductNameAutocomplete } from "@/components/product-name-autocomplete"
import { MaterialLineAutocomplete, type MaterialSearchResult } from "@/components/material-line-autocomplete"
import { ResourceLineAutocomplete } from "@/components/resource-line-autocomplete"

// ── Tipos ────────────────────────────────────────────────────────────────────

interface MaterialLine {
    materialId: number | null
    label: string
    qty: number
    unitCost: number
    isNew?: boolean // solo UI: línea recién agregada por el asistente (no se guarda)
}

interface LaborLine {
    resourceId: number | null
    label: string
    hours: number
    hourlyRate: number
}

interface ExtraLine {
    label: string
    amount: number
}

export interface BudgetEditorData {
    id: number
    name: string
    description: string
    status: "draft" | "final"
    marginPct: number
    materials: MaterialLine[]
    labor: LaborLine[]
    extras: ExtraLine[]
    alegraItemId: number | null
}

interface LaborResource {
    id: number
    name: string
    role: string | null
    monthly_value: number
}

export function formatArs(n: number): string {
    const rounded = Math.round(Number.isFinite(n) ? n : 0)
    const sign = rounded < 0 ? "-" : ""
    return `${sign}$${Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}

// ── Editor ───────────────────────────────────────────────────────────────────

export function BudgetEditor({
    budget,
    resources,
    defaultMargin,
    workHoursPerMonth,
    alegraEnabled = false,
}: {
    budget: BudgetEditorData | null // null = nuevo
    resources: LaborResource[]
    defaultMargin: number
    workHoursPerMonth: number
    alegraEnabled?: boolean
}) {
    const router = useRouter()
    const { toast } = useToast()

    const [name, setName] = useState(budget?.name ?? "")
    const [nameError, setNameError] = useState(false)
    const [alegraItemId, setAlegraItemId] = useState<number | null>(budget?.alegraItemId ?? null)
    const [description, setDescription] = useState(budget?.description ?? "")
    const [status, setStatus] = useState<"draft" | "final">(budget?.status ?? "draft")
    const [marginPct, setMarginPct] = useState<number>(budget?.marginPct ?? defaultMargin)
    const [materials, setMaterials] = useState<MaterialLine[]>(budget?.materials ?? [])
    const [labor, setLabor] = useState<LaborLine[]>(budget?.labor ?? [])
    const [extras, setExtras] = useState<ExtraLine[]>(budget?.extras ?? [])
    const [saving, setSaving] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [fromAi, setFromAi] = useState(false)

    // Catálogo de inventario para el buscador de materiales por línea. Se trae una vez al
    // montar y el filtrado difuso (sin acentos, tolerante a typos) se hace en el cliente.
    const [materialsCatalog, setMaterialsCatalog] = useState<MaterialSearchResult[]>([])
    useEffect(() => {
        void getMaterialsCatalog().then(({ materials }) => {
            setMaterialsCatalog(
                (materials as MaterialSearchResult[]).map((m) => ({ ...m, unit_cost: Number(m.unit_cost) })),
            )
        })
    }, [])

    // Costo/hora derivado del valor mensual del recurso.
    const hourlyOf = (r: LaborResource) =>
        Math.round((r.monthly_value / workHoursPerMonth) * 100) / 100

    // Opciones para el buscador de recurso por línea.
    const resourceOptions = resources.map((r) => ({
        id: r.id,
        name: r.role ? `${r.name} (${r.role})` : r.name,
        hint: `${formatArs(hourlyOf(r))}/h`,
    }))

    // ── Prefill del borrador de la IA ────────────────────────────────────────
    // En modo NUEVO precarga todo. En modo EXISTENTE (ya viene un budget), AGREGA las
    // líneas del borrador a las que ya tiene el producto (para "sumarle" al existente).
    // Se consume al montar Y ante el evento "avantec:budget-draft" (que dispara el botón
    // "Calcular costo"), para que funcione aunque ya estés en la misma página del editor.
    useEffect(() => {
        const consumeDraft = () => {
            try {
                const raw = sessionStorage.getItem(BUDGET_DRAFT_KEY)
                if (!raw) return
                sessionStorage.removeItem(BUDGET_DRAFT_KEY)
                const draft = JSON.parse(raw) as {
                    title?: string
                    lines?: Array<{ materialId: number | null; label: string; qty: number; unitPrice: number }>
                }
                const lines: MaterialLine[] = (draft.lines ?? []).map((l) => ({
                    materialId: typeof l.materialId === "number" ? l.materialId : null,
                    label: String(l.label ?? ""),
                    qty: Number.isFinite(l.qty) && l.qty > 0 ? l.qty : 1,
                    unitCost: Number.isFinite(l.unitPrice) && l.unitPrice >= 0 ? l.unitPrice : 0,
                }))
                if (!lines.length) return
                setFromAi(true)

                if (budget === null) {
                    // Nuevo: precargar título + materiales.
                    if (draft.title) setName(draft.title)
                    setMaterials(lines)
                    // Refrescar contra los costos vigentes de la DB (la IA pudo citar costos viejos).
                    const ids = lines.map((l) => l.materialId).filter((n): n is number => n !== null)
                    if (ids.length) {
                        void getCurrentCosts(ids).then(({ costs }) => {
                            setMaterials((prev) =>
                                prev.map((m) =>
                                    m.materialId !== null && costs[m.materialId] !== undefined
                                        ? { ...m, unitCost: costs[m.materialId] }
                                        : m,
                                ),
                            )
                        })
                    }
                } else {
                    // Existente: AGREGAR las líneas nuevas a las que ya tiene (no toca el título
                    // ni refresca costos, para respetar precios que el usuario haya indicado).
                    // Se marcan isNew para distinguirlas de las que ya estaban.
                    setMaterials((prev) => [...prev, ...lines.map((l) => ({ ...l, isNew: true }))])
                    toast.success("Líneas agregadas", {
                        description: `Se sumaron ${lines.length} línea(s) del asistente (marcadas "Nuevo"). Revisá y guardá.`,
                    })
                }
            } catch {
                // borrador corrupto: se ignora
            }
        }

        consumeDraft()
        window.addEventListener("avantec:budget-draft", consumeDraft)
        return () => window.removeEventListener("avantec:budget-draft", consumeDraft)
    }, [budget])

    // ── Búsqueda con debounce ────────────────────────────────────────────────
    // Elegir un material del inventario en la línea i (rellena nombre y costo unitario).
    const pickMaterial = (i: number, r: MaterialSearchResult) => {
        updateMaterial(i, { materialId: r.id, label: r.name, unitCost: Number(r.unit_cost) })
    }

    // Escribir libre en la línea i → material manual (fuera del inventario).
    const setMaterialText = (i: number, text: string) => {
        updateMaterial(i, { materialId: null, label: text })
    }

    const addMaterialLine = () => {
        setMaterials((prev) => [...prev, { materialId: null, label: "", qty: 1, unitCost: 0 }])
    }

    const updateMaterial = (i: number, patch: Partial<MaterialLine>) => {
        setMaterials((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
    }

    const removeMaterial = (i: number) => {
        setMaterials((prev) => prev.filter((_, idx) => idx !== i))
    }

    // ── Mano de obra ─────────────────────────────────────────────────────────
    // Elegir un recurso en la línea i (rellena nombre y costo/hora).
    const pickResource = (i: number, resourceId: number) => {
        const res = resources.find((r) => r.id === resourceId)
        if (!res) return
        updateLabor(i, {
            resourceId: res.id,
            label: res.role ? `${res.name} (${res.role})` : res.name,
            hourlyRate: hourlyOf(res),
        })
    }

    // Escribir libre en la línea i → recurso manual.
    const setLaborText = (i: number, text: string) => {
        updateLabor(i, { resourceId: null, label: text })
    }

    const addLaborLine = () => {
        setLabor((prev) => [...prev, { resourceId: null, label: "", hours: 1, hourlyRate: 0 }])
    }

    const updateLabor = (i: number, patch: Partial<LaborLine>) => {
        setLabor((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
    }

    const removeLabor = (i: number) => {
        setLabor((prev) => prev.filter((_, idx) => idx !== i))
    }

    // ── Otros costos ─────────────────────────────────────────────────────────
    const addExtra = () => setExtras((prev) => [...prev, { label: "", amount: 0 }])
    const updateExtra = (i: number, patch: Partial<ExtraLine>) => {
        setExtras((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
    }
    const removeExtra = (i: number) => setExtras((prev) => prev.filter((_, idx) => idx !== i))

    // ── Actualizar precios vigentes ──────────────────────────────────────────
    const refreshPrices = async () => {
        const ids = materials.map((m) => m.materialId).filter((n): n is number => n !== null)
        if (!ids.length) {
            toast("Sin materiales del inventario", { description: "No hay líneas vinculadas para actualizar." })
            return
        }
        setRefreshing(true)
        const { costs, error } = await getCurrentCosts(ids)
        setRefreshing(false)
        if (error) {
            toast.error("Error", { description: error })
            return
        }
        setMaterials((prev) =>
            prev.map((m) =>
                m.materialId !== null && costs[m.materialId] !== undefined
                    ? { ...m, unitCost: costs[m.materialId] }
                    : m,
            ),
        )
        toast.success("Precios actualizados", { description: "Costos tomados del inventario actual." })
    }

    // ── Totales (en vivo) ────────────────────────────────────────────────────
    const totals = useMemo(() => {
        const materialsTotal = materials.reduce((acc, m) => acc + m.qty * m.unitCost, 0)
        const laborTotal = labor.reduce((acc, l) => acc + l.hours * l.hourlyRate, 0)
        const extrasTotal = extras.reduce((acc, e) => acc + e.amount, 0)
        const cost = materialsTotal + laborTotal + extrasTotal
        const salePrice = cost * (1 + (Number.isFinite(marginPct) ? marginPct : 0) / 100)
        return { materialsTotal, laborTotal, extrasTotal, cost, salePrice, profit: salePrice - cost }
    }, [materials, labor, extras, marginPct])

    // ── Guardar / eliminar ───────────────────────────────────────────────────
    const onSave = async () => {
        // Validación visible: el nombre es obligatorio (antes el botón quedaba mudo).
        if (!name.trim()) {
            setNameError(true)
            toast.error("Falta el nombre", { description: "Ingresá el nombre del producto para guardar el cálculo." })
            document.getElementById("budget-name")?.focus()
            return
        }
        // Solo se guardan líneas con contenido: las vacías (recién agregadas) se descartan.
        const cleanMaterials = materials.filter((m) => m.label.trim() !== "")
        const cleanLabor = labor.filter((l) => l.label.trim() !== "")

        // Bloqueo: no se puede cargar un material o mano de obra que no exista. Debe elegirse
        // de la lista (material del inventario / recurso cargado). Si no, hay que crearlo.
        const badMaterial = cleanMaterials.find((m) => m.materialId === null)
        if (badMaterial) {
            toast.error("Material inexistente", {
                description: `"${badMaterial.label}" no está en el inventario. Crealo en Inventario y elegilo de la lista antes de guardar.`,
            })
            return
        }
        const badLabor = cleanLabor.find((l) => l.resourceId === null)
        if (badLabor) {
            toast.error("Mano de obra inexistente", {
                description: `"${badLabor.label}" no está cargada. Creá el recurso en Mano de Obra y elegilo de la lista antes de guardar.`,
            })
            return
        }

        const payload: BudgetPayload = {
            name,
            description,
            alegra_item_id: alegraItemId,
            status,
            margin_pct: Number.isFinite(marginPct) ? marginPct : 0,
            materials: cleanMaterials.map((m) => ({
                material_id: m.materialId,
                label: m.label,
                qty: m.qty,
                unit_cost: m.unitCost,
            })),
            labor: cleanLabor.map((l) => ({
                resource_id: l.resourceId,
                label: l.label,
                hours: l.hours,
                hourly_rate: l.hourlyRate,
            })),
            extras: extras.map((e) => ({ label: e.label, amount: e.amount })),
        }
        setSaving(true)
        const result = await saveBudget(budget?.id ?? null, payload)
        setSaving(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        toast.success("Cálculo de costo guardado")
        router.push("/costos")
        router.refresh()
    }

    const doDelete = async () => {
        if (!budget) return
        setDeleting(true)
        const result = await deleteBudget(budget.id)
        setDeleting(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        setConfirmOpen(false)
        toast.success("Cálculo eliminado")
        router.push("/costos")
        router.refresh()
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna principal */}
            <div className="lg:col-span-2 space-y-6">
                {fromAi && (
                    <div className="flex items-center gap-2 p-3 rounded-lg border bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200 text-sm">
                        <Sparkles className="w-4 h-4 shrink-0" />
                        Propuesta generada por la IA: revisá materiales, cantidades y costos antes de guardar. La decisión final es tuya.
                    </div>
                )}

                {/* Datos del producto */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Producto</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="budget-name">Nombre *</Label>
                            <ProductNameAutocomplete
                                value={name}
                                itemId={alegraItemId}
                                onChange={(v) => { setName(v); if (nameError) setNameError(false) }}
                                onSelect={(it) => setAlegraItemId(it?.id ?? null)}
                                enabled={alegraEnabled}
                                invalid={nameError}
                            />
                            {nameError && (
                                <p className="mt-1 text-xs text-destructive">El nombre del producto es obligatorio.</p>
                            )}
                        </div>
                        <div>
                            <Label htmlFor="budget-description">Descripción</Label>
                            <Textarea
                                id="budget-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Detalles, medidas, observaciones…"
                                rows={2}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Materiales */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-lg">Materiales</CardTitle>
                        <Button variant="outline" size="sm" onClick={refreshPrices} disabled={refreshing}>
                            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                            Actualizar precios
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Líneas: cada una con su buscador de material (estilo presupuesto) */}
                        {materials.length > 0 && (
                            <div className="space-y-2">
                                <div className="hidden md:grid grid-cols-[1fr_150px_120px_110px_36px] gap-2 text-xs text-muted-foreground px-1">
                                    <span>Material</span>
                                    <span>Cantidad</span>
                                    <span>Costo unitario</span>
                                    <span className="text-right">Subtotal</span>
                                    <span />
                                </div>
                                {materials.map((m, i) => (
                                    <div
                                        key={i}
                                        className={`grid grid-cols-2 md:grid-cols-[1fr_150px_120px_110px_36px] gap-2 items-center ${
                                            m.isNew ? "rounded-md bg-green-50 px-1 py-1 ring-1 ring-green-200 dark:bg-green-950/30 dark:ring-green-900" : ""
                                        }`}
                                    >
                                        <div className="col-span-2 min-w-0 md:col-span-1">
                                            {m.isNew && (
                                                <span className="mb-1 inline-block rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                                    Nuevo
                                                </span>
                                            )}
                                            <MaterialLineAutocomplete
                                                value={m.label}
                                                catalog={materialsCatalog}
                                                linked={m.materialId !== null}
                                                onPick={(r) => pickMaterial(i, r)}
                                                onText={(t) => setMaterialText(i, t)}
                                            />
                                        </div>
                                        <NumericInput
                                            value={m.qty}
                                            onChange={(n) => updateMaterial(i, { qty: n })}
                                            withSteppers
                                        />
                                        <NumericInput
                                            value={m.unitCost}
                                            onChange={(n) => updateMaterial(i, { unitCost: n })}
                                        />
                                        <span className="text-sm text-right font-medium">{formatArs(m.qty * m.unitCost)}</span>
                                        <Button variant="ghost" size="icon" onClick={() => removeMaterial(i)}>
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={addMaterialLine}
                            className="flex items-center gap-2 pt-1 text-sm font-medium text-primary hover:underline"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar línea
                        </button>
                    </CardContent>
                </Card>

                {/* Mano de obra */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Mano de Obra</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {labor.length > 0 && (
                            <div className="space-y-2">
                                <div className="hidden md:grid grid-cols-[1fr_90px_120px_110px_36px] gap-2 text-xs text-muted-foreground px-1">
                                    <span>Recurso / tarea</span>
                                    <span>Horas</span>
                                    <span>Costo por hora</span>
                                    <span className="text-right">Subtotal</span>
                                    <span />
                                </div>
                                {labor.map((l, i) => (
                                    <div key={i} className="grid grid-cols-2 md:grid-cols-[1fr_90px_120px_110px_36px] gap-2 items-center">
                                        <div className="col-span-2 min-w-0 md:col-span-1">
                                            <ResourceLineAutocomplete
                                                value={l.label}
                                                options={resourceOptions}
                                                linked={l.resourceId !== null}
                                                onPick={(id) => pickResource(i, id)}
                                                onText={(t) => setLaborText(i, t)}
                                            />
                                        </div>
                                        <NumericInput
                                            value={l.hours}
                                            onChange={(n) => updateLabor(i, { hours: n })}
                                        />
                                        <NumericInput
                                            value={l.hourlyRate}
                                            onChange={(n) => updateLabor(i, { hourlyRate: n })}
                                        />
                                        <span className="text-sm text-right font-medium">{formatArs(l.hours * l.hourlyRate)}</span>
                                        <Button variant="ghost" size="icon" onClick={() => removeLabor(i)}>
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={addLaborLine}
                            className="flex items-center gap-2 pt-1 text-sm font-medium text-primary hover:underline"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar línea
                        </button>
                        {resources.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                                No hay recursos cargados. Podés crearlos en{" "}
                                <Link href="/settings/recursos" className="font-medium text-primary hover:underline">
                                    Mano de Obra
                                </Link>{" "}
                                (menú lateral), o escribir un recurso manual en la línea.
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Otros costos */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Otros Costos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {extras.length > 0 && (
                            <div className="space-y-2">
                                {extras.map((e, i) => (
                                    <div key={i} className="grid grid-cols-[1fr_130px_36px] gap-2 items-center">
                                        <Input
                                            value={e.label}
                                            onChange={(ev) => updateExtra(i, { label: ev.target.value })}
                                            placeholder="Ej: flete, pintura, tercerizado…"
                                        />
                                        <NumericInput
                                            value={e.amount}
                                            onChange={(n) => updateExtra(i, { amount: n })}
                                        />
                                        <Button variant="ghost" size="icon" onClick={() => removeExtra(i)}>
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <Button variant="outline" size="sm" onClick={addExtra}>
                            <Plus className="w-4 h-4 mr-2" />
                            Agregar costo
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Panel de totales */}
            <div className="space-y-6">
                <Card className="sticky top-24">
                    <CardHeader>
                        <CardTitle className="text-lg">Resumen</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Materiales</span>
                                <span>{formatArs(totals.materialsTotal)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Mano de obra</span>
                                <span>{formatArs(totals.laborTotal)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Otros costos</span>
                                <span>{formatArs(totals.extrasTotal)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 font-semibold">
                                <span>Costo de producción</span>
                                <span>{formatArs(totals.cost)}</span>
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="margin">Margen de ganancia (%)</Label>
                            <NumericInput
                                id="margin"
                                value={marginPct}
                                onChange={setMarginPct}
                            />
                        </div>

                        <div className="space-y-2 text-sm border-t pt-3">
                            <div className="flex justify-between text-base font-bold">
                                <span>Precio de venta sugerido</span>
                                <span>{formatArs(totals.salePrice)}</span>
                            </div>
                            <div className="flex justify-between text-green-600 dark:text-green-400">
                                <span>Ganancia</span>
                                <span>{formatArs(totals.profit)}</span>
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="status">Estado</Label>
                            <select
                                id="status"
                                value={status}
                                onChange={(e) => setStatus(e.target.value as "draft" | "final")}
                                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                            >
                                <option value="draft">Borrador</option>
                                <option value="final">Final</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                            <Button onClick={onSave} disabled={saving}>
                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Guardar cálculo
                            </Button>
                            {budget && (
                                <Button variant="outline" className="text-destructive" onClick={() => setConfirmOpen(true)}>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Eliminar
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
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
