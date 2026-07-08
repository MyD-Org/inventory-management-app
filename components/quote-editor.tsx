"use client"

// Editor de presupuesto comercial: cotización a un cliente que reutiliza los COSTOS de
// fabricación ya calculados. Cada ítem parte de un cálculo de costo (precio de venta
// sugerido = costo × (1 + margen)), con cantidad y precio unitario editables, más un
// descuento global. El total se recalcula en vivo.

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Plus, Trash2, Save, FileDown, ExternalLink } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { NumericInput } from "@/components/numeric-input"
import { formatArs } from "@/lib/format"
import { quoteTotals, lineNet } from "@/lib/quote-calc"
import { saveQuote, deleteQuote, type QuotePayload } from "@/lib/quote-actions"
import { AlegraDialog } from "@/components/alegra-dialog"
import { CustomerAutocomplete } from "@/components/customer-autocomplete"
import { ProductLineAutocomplete } from "@/components/product-line-autocomplete"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { QUOTE_DRAFT_KEY } from "@/components/ai-assistant"

interface QuoteItem {
    budgetId: number | null
    label: string
    reference: string
    description: string
    qty: number
    unitPrice: number
    discountPct: number
    taxPct: number
}

export interface QuoteEditorData {
    id: number
    title: string
    customerName: string
    status: "draft" | "sent" | "accepted" | "rejected"
    notes: string
    items: QuoteItem[]
    alegraEstimateId: number | null
    alegraEstimateNumber: string | null
    alegraContactId: number | null
}

// Producto costeado disponible para agregar (un cálculo de costo de /costos).
export interface CostedProduct {
    id: number
    name: string
    description: string
    cost: number
    marginPct: number
    salePrice: number
}

export function QuoteEditor({
    quote,
    products,
    heading,
    alegraEnabled = false,          // buscador de clientes (contactos) — funciona con cualquier plan
    alegraEstimatesEnabled = false, // botón "Crear en Alegra" — solo con plan que permita cotizaciones por API
}: {
    quote: QuoteEditorData | null // null = nuevo
    products: CostedProduct[]
    heading: string
    alegraEnabled?: boolean
    alegraEstimatesEnabled?: boolean
}) {
    const router = useRouter()
    const { toast } = useToast()

    const [title, setTitle] = useState(quote?.title ?? "")
    const [titleError, setTitleError] = useState(false)
    const [customerName, setCustomerName] = useState(quote?.customerName ?? "")
    const [alegraContactId, setAlegraContactId] = useState<number | null>(quote?.alegraContactId ?? null)
    // El estado ya no se edita desde el formulario; se mantiene el que tenga (o "draft").
    const status: QuoteEditorData["status"] = quote?.status ?? "draft"
    const [notes, setNotes] = useState(quote?.notes ?? "")
    const [items, setItems] = useState<QuoteItem[]>(quote?.items ?? [])
    const [saving, setSaving] = useState(false)
    const [alegraOpen, setAlegraOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)

    // ── Prefill del borrador de cotización de la IA (solo en presupuesto NUEVO) ──
    // Lo deja el botón "Abrir en el editor" del chat cuando la card es una cotización.
    useEffect(() => {
        const consumeDraft = () => {
            try {
                const raw = sessionStorage.getItem(QUOTE_DRAFT_KEY)
                if (!raw) return
                sessionStorage.removeItem(QUOTE_DRAFT_KEY)
                if (quote !== null) return // solo precargamos en presupuesto nuevo
                const draft = JSON.parse(raw) as {
                    title?: string
                    lines?: Array<{ budgetId: number | null; label: string; qty: number; unitPrice: number }>
                }
                const its: QuoteItem[] = (draft.lines ?? []).map((l) => ({
                    budgetId: typeof l.budgetId === "number" ? l.budgetId : null,
                    label: String(l.label ?? ""),
                    reference: "",
                    description: "",
                    qty: Number.isFinite(l.qty) && l.qty > 0 ? l.qty : 1,
                    unitPrice: Number.isFinite(l.unitPrice) && l.unitPrice >= 0 ? l.unitPrice : 0,
                    discountPct: 0,
                    taxPct: 0,
                }))
                if (!its.length) return
                if (draft.title) setTitle(draft.title)
                setItems(its)
                toast.success("Cotización precargada", {
                    description: `Se cargaron ${its.length} producto(s) del asistente. Completá el cliente y guardá.`,
                })
            } catch {
                // borrador corrupto: se ignora
            }
        }
        consumeDraft()
        window.addEventListener("avantec:quote-draft", consumeDraft)
        return () => window.removeEventListener("avantec:quote-draft", consumeDraft)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Elegir un producto costeado en la línea i (rellena nombre, descripción y precio).
    const pickProduct = (i: number, p: CostedProduct) => {
        updateItem(i, { budgetId: p.id, label: p.name, description: p.description, unitPrice: p.salePrice })
    }

    // Escribir libre en la línea i → ítem manual (sin producto costeado vinculado).
    const setLineText = (i: number, text: string) => {
        updateItem(i, { budgetId: null, label: text })
    }

    const addLine = () => {
        setItems((prev) => [
            ...prev,
            { budgetId: null, label: "", reference: "", description: "", qty: 1, unitPrice: 0, discountPct: 0, taxPct: 0 },
        ])
    }

    const updateItem = (i: number, patch: Partial<QuoteItem>) => {
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
    }

    const removeItem = (i: number) => {
        setItems((prev) => prev.filter((_, idx) => idx !== i))
    }

    const totals = useMemo(
        () =>
            quoteTotals(
                items.map((it) => ({
                    qty: it.qty,
                    unitPrice: it.unitPrice,
                    discountPct: it.discountPct,
                    taxPct: it.taxPct,
                })),
            ),
        [items],
    )

    const buildPayload = (): QuotePayload => ({
        title,
        customer_name: customerName,
        alegra_contact_id: alegraContactId,
        status,
        notes,
        // Se descartan las líneas vacías (recién agregadas sin producto elegido).
        items: items.filter((it) => it.label.trim() !== "").map((it) => ({
            budget_id: it.budgetId,
            label: it.label,
            reference: it.reference,
            description: it.description,
            qty: it.qty,
            unit_price: it.unitPrice,
            discount_pct: it.discountPct,
            tax_pct: it.taxPct,
        })),
    })

    const onSave = async (thenPrint = false) => {
        // Validación visible (antes los botones quedaban mudos si faltaba algo).
        if (!title.trim()) {
            setTitleError(true)
            toast.error("Falta el título", { description: "Ingresá un título para el presupuesto." })
            document.getElementById("quote-title")?.focus()
            return
        }
        if (items.filter((it) => it.label.trim() !== "").length === 0) {
            toast.error("Sin productos", { description: "Agregá al menos una línea con un producto." })
            return
        }
        // Bloqueo: el presupuesto solo admite productos ya costeados. Si hay una línea con
        // texto que no corresponde a ningún producto elegido de la lista, no se guarda.
        const badItem = items.find((it) => it.label.trim() !== "" && it.budgetId === null)
        if (badItem) {
            toast.error("Producto inexistente", {
                description: `"${badItem.label}" no es un producto costeado. Calculalo en Calcular Costos y elegilo de la lista antes de guardar.`,
            })
            return
        }
        setSaving(true)
        const result = await saveQuote(quote?.id ?? null, buildPayload())
        setSaving(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        toast.success("Presupuesto guardado")
        if (thenPrint && result.id) {
            router.push(`/presupuestos/${result.id}/imprimir`)
        } else {
            router.push("/presupuestos")
            router.refresh()
        }
    }

    const doDelete = async () => {
        if (!quote) return
        setDeleting(true)
        const result = await deleteQuote(quote.id)
        setDeleting(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        setConfirmOpen(false)
        toast.success("Presupuesto eliminado")
        router.push("/presupuestos")
        router.refresh()
    }

    return (
        <div className="space-y-6">
            {/* Header: título + eliminar en la misma línea */}
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-2xl font-bold">{heading}</h1>
                {quote && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setConfirmOpen(true)}
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Eliminar
                    </Button>
                )}
            </div>

            <div className="space-y-6">
                {/* Datos del presupuesto */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Datos del presupuesto</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="quote-title">Título *</Label>
                                <Input
                                    id="quote-title"
                                    value={title}
                                    onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(false) }}
                                    placeholder='Ej: "Presupuesto portones - Obra Norte"'
                                    aria-invalid={titleError}
                                    className={titleError ? "border-destructive focus-visible:ring-destructive" : undefined}
                                />
                                {titleError && (
                                    <p className="mt-1 text-xs text-destructive">El título es obligatorio.</p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="quote-customer">Cliente</Label>
                                <CustomerAutocomplete
                                    value={customerName}
                                    contactId={alegraContactId}
                                    onChange={setCustomerName}
                                    onSelect={(c) => setAlegraContactId(c?.id ?? null)}
                                    enabled={alegraEnabled}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Productos (tabla estilo factura: una línea por producto) */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Productos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {products.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                                No hay productos costeados todavía. Calculá el costo de un producto en Calcular Costos
                                para elegirlo desde la lista (o cargá una línea manual escribiendo el nombre).
                            </p>
                        )}

                        <div className="overflow-x-auto">
                            <div className="min-w-[880px] space-y-2">
                                {/* Encabezado */}
                                <div className="grid grid-cols-[1.6fr_110px_110px_72px_72px_1.3fr_120px_90px_36px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                                    <span>Producto</span>
                                    <span>Referencia</span>
                                    <span>Precio</span>
                                    <span>Desc %</span>
                                    <span>Imp %</span>
                                    <span>Descripción</span>
                                    <span>Cantidad</span>
                                    <span className="text-right">Total</span>
                                    <span />
                                </div>

                                {items.map((it, i) => (
                                    <div
                                        key={i}
                                        className="grid grid-cols-[1.6fr_110px_110px_72px_72px_1.3fr_120px_90px_36px] gap-2 items-center"
                                    >
                                        <ProductLineAutocomplete
                                            value={it.label}
                                            products={products}
                                            linked={it.budgetId !== null}
                                            onPick={(p) => pickProduct(i, p)}
                                            onText={(t) => setLineText(i, t)}
                                        />
                                        <Input
                                            value={it.reference}
                                            onChange={(e) => updateItem(i, { reference: e.target.value })}
                                            placeholder="Referencia"
                                            className="text-sm"
                                        />
                                        <NumericInput value={it.unitPrice} onChange={(n) => updateItem(i, { unitPrice: n })} />
                                        <NumericInput value={it.discountPct} onChange={(n) => updateItem(i, { discountPct: n })} />
                                        <NumericInput value={it.taxPct} onChange={(n) => updateItem(i, { taxPct: n })} />
                                        <Input
                                            value={it.description}
                                            onChange={(e) => updateItem(i, { description: e.target.value })}
                                            placeholder="Descripción (opcional)"
                                            className="text-sm"
                                        />
                                        <NumericInput value={it.qty} onChange={(n) => updateItem(i, { qty: n })} withSteppers />
                                        <span className="text-right text-sm font-medium">
                                            {formatArs(lineNet({ qty: it.qty, unitPrice: it.unitPrice, discountPct: it.discountPct, taxPct: it.taxPct }))}
                                        </span>
                                        <Button variant="ghost" size="icon" onClick={() => removeItem(i)} title="Quitar línea">
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Agregar línea */}
                        <button
                            type="button"
                            onClick={addLine}
                            className="flex items-center gap-2 pt-1 text-sm font-medium text-primary hover:underline"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar línea
                        </button>
                    </CardContent>
                </Card>

                {/* Notas (izquierda) + totales y acciones (derecha), sin recuadro */}
                <div className="flex flex-col gap-8 px-1 pt-2 md:flex-row">
                        <div className="md:flex-[2]">
                            <Label htmlFor="quote-notes">Notas / condiciones</Label>
                            <Textarea
                                id="quote-notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Validez de la oferta, forma de pago, plazo de entrega…"
                                rows={4}
                            />
                        </div>

                        <div className="flex flex-col gap-4 md:flex-[3]">
                        <div className="w-full space-y-3 text-base">
                            <div className="flex justify-between text-muted-foreground">
                                <span>Subtotal (bruto)</span>
                                <span>{formatArs(totals.gross)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Descuento</span>
                                <span>-{formatArs(totals.discount)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Neto</span>
                                <span>{formatArs(totals.subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Impuestos</span>
                                <span>+{formatArs(totals.tax)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-3 text-xl font-bold">
                                <span>Total</span>
                                <span>{formatArs(totals.total)}</span>
                            </div>
                        </div>

                        {/* Acciones principales */}
                        <div className="flex w-full flex-col gap-2 pt-2">
                            <Button onClick={() => onSave(false)} disabled={saving}>
                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Guardar
                            </Button>
                            <Button variant="outline" onClick={() => onSave(true)} disabled={saving}>
                                <FileDown className="w-4 h-4 mr-2" />
                                Imprimir / PDF
                            </Button>

                            {/* Alegra: si ya está creada muestra el link; si no, el botón (guardá antes). */}
                            {quote && quote.alegraEstimateId ? (
                                <a
                                    href={`https://app.alegra.com/estimate/view/id/${quote.alegraEstimateId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center h-9 px-4 rounded-md border text-sm font-medium bg-green-50 border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:border-green-800 dark:text-green-300"
                                >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    En Alegra{quote.alegraEstimateNumber ? ` — N° ${quote.alegraEstimateNumber}` : ""}
                                </a>
                            ) : quote && alegraEstimatesEnabled ? (
                                <Button variant="outline" onClick={() => setAlegraOpen(true)}>
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Crear en Alegra
                                </Button>
                            ) : null}
                        </div>
                        </div>
                </div>

                {quote && (
                    <AlegraDialog
                        quoteId={quote.id}
                        customerName={customerName}
                        preselectedContact={alegraContactId ? { id: alegraContactId, name: customerName } : null}
                        open={alegraOpen}
                        onOpenChange={setAlegraOpen}
                    />
                )}

                <ConfirmDialog
                    open={confirmOpen}
                    onOpenChange={setConfirmOpen}
                    title="Eliminar presupuesto"
                    description="Esta acción no se puede deshacer. ¿Querés eliminar este presupuesto?"
                    confirmLabel="Eliminar"
                    destructive
                    loading={deleting}
                    onConfirm={doDelete}
                />
            </div>
        </div>
    )
}
