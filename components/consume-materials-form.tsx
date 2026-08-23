"use client"

// Formulario de descuento de materiales por un pedido. Lo usan las dos entradas
// (el detalle del pedido y Salida de Stock) para que se comporten igual.
//
// Las cantidades se guardan como TEXTO, no como número: si se guardaran como
// número, borrar el campo daría Number("") = 0 y aparecería un cero pegado que
// hay que borrar antes de escribir.

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Plus, X } from "lucide-react"
import { consumeOrderMaterials, searchInventoryMaterials } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import type { MaterialNeed } from "@/lib/orders"

interface Row {
    material_id: number
    label: string
    qty: string
    available: number | null
    /** Lo que pide el pedido. null en las filas agregadas a mano. */
    pending: number | null
}

function AgregarMaterial({ onPick, yaEstan }: { onPick: (r: Row) => void; yaEstan: number[] }) {
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<{ material_id: number; label: string; available: number }[]>([])
    const [buscando, setBuscando] = useState(false)
    const [abierto, setAbierto] = useState(false)
    const boxRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (query.trim().length < 2) {
            setResults([])
            return
        }
        setBuscando(true)
        const t = setTimeout(async () => {
            setResults(await searchInventoryMaterials(query))
            setBuscando(false)
        }, 250)
        return () => clearTimeout(t)
    }, [query])

    useEffect(() => {
        function fuera(e: MouseEvent) {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAbierto(false)
        }
        document.addEventListener("mousedown", fuera)
        return () => document.removeEventListener("mousedown", fuera)
    }, [])

    return (
        <div ref={boxRef} className="relative">
            <Input
                value={query}
                autoComplete="off"
                placeholder="Agregar otro material del inventario"
                className="h-9 text-base"
                onFocus={() => setAbierto(true)}
                onChange={(e) => {
                    setQuery(e.target.value)
                    setAbierto(true)
                }}
            />
            {buscando && (
                <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" />
            )}

            {abierto && results.length > 0 && (
                <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                    {results
                        .filter((r) => !yaEstan.includes(r.material_id))
                        .map((r) => (
                            <button
                                key={r.material_id}
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted"
                                onClick={() => {
                                    onPick({ ...r, qty: "1", pending: null })
                                    setQuery("")
                                    setAbierto(false)
                                }}
                            >
                                <span className="text-base flex-1 min-w-0 truncate">{r.label}</span>
                                <span className="text-sm text-muted-foreground shrink-0">
                                    hay {r.available}
                                </span>
                            </button>
                        ))}
                </div>
            )}
        </div>
    )
}

export function ConsumeMaterialsForm({
    orderId,
    needs,
    onDone,
    onCancel,
}: {
    orderId: number
    needs: MaterialNeed[]
    onDone: () => void
    onCancel?: () => void
}) {
    const { toast } = useToast()
    const [rows, setRows] = useState<Row[]>([])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setRows(
            needs
                .filter((n) => n.material_id !== null && n.pending > 0)
                .map((n) => ({
                    material_id: n.material_id!,
                    label: n.label,
                    // Sugerimos lo pendiente, sin pasarnos de lo que hay.
                    qty: String(Math.min(n.pending, n.available ?? n.pending)),
                    available: n.available,
                    pending: n.pending,
                })),
        )
    }, [needs])

    const parsear = (q: string) => {
        const n = Number(q)
        return Number.isFinite(n) ? n : NaN
    }

    // Dos cosas distintas, que se muestran distinto:
    //
    // faltaStock  el pedido necesita más de lo que hay. No es culpa de quien
    //             carga: se avisa en rojo pero NO bloquea, para poder descontar
    //             lo que sí hay y el resto cuando llegue la mercadería.
    // errorDe     lo tipeado no se puede descontar. Bloquea el botón.
    const faltaStock = (r: Row) =>
        r.available !== null && r.pending !== null && r.available < r.pending

    const errorDe = (r: Row): string | null => {
        if (r.qty.trim() === "") return null
        const n = parsear(r.qty)
        if (Number.isNaN(n) || n < 0) return "Cantidad inválida"
        if (r.available !== null && n > r.available) return `Solo hay ${r.available}`
        return null
    }

    const hayError = rows.some((r) => errorDe(r) !== null)
    const aDescontar = rows.filter((r) => {
        const n = parsear(r.qty)
        return !Number.isNaN(n) && n > 0
    })

    async function descontar() {
        setSaving(true)
        const result = await consumeOrderMaterials(
            orderId,
            aDescontar.map((r) => ({ material_id: r.material_id, quantity: parsear(r.qty) })),
        )
        setSaving(false)
        if (result.error) {
            toast.error("No se pudo descontar", { description: result.error })
            return
        }
        toast.success(`${result.count} materiales descontados del inventario`)
        onDone()
    }

    return (
        <>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {rows.map((r, idx) => {
                    const error = errorDe(r)
                    return (
                        <div key={r.material_id} className="flex items-start gap-3">
                            <div className="w-20 shrink-0">
                                <Input
                                    type="number"
                                    min={0}
                                    value={r.qty}
                                    onChange={(e) =>
                                        setRows((rs) =>
                                            rs.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)),
                                        )
                                    }
                                    className={`h-9 text-base ${error ? "border-destructive" : ""}`}
                                />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="text-base truncate">{r.label}</div>
                                {error ? (
                                    <div className="text-sm text-destructive">{error}</div>
                                ) : (
                                    faltaStock(r) && (
                                        <div className="text-sm text-destructive">
                                            {r.available === 0
                                                ? "No hay stock de este material"
                                                : `Faltan ${r.pending! - r.available!} para completar el pedido`}
                                        </div>
                                    )
                                )}
                            </div>

                            <span
                                className={`text-sm shrink-0 pt-1.5 ${
                                    faltaStock(r) ? "text-destructive" : "text-muted-foreground"
                                }`}
                            >
                                {r.pending !== null ? `necesita ${r.pending} · ` : "extra · "}
                                hay {r.available ?? "—"}
                            </span>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                title="Quitar del descuento"
                                onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )
                })}

                {rows.length === 0 && (
                    <p className="text-base text-muted-foreground py-2">
                        No queda nada por descontar. Podés agregar un material igual.
                    </p>
                )}
            </div>

            <div className="pt-1">
                <AgregarMaterial
                    yaEstan={rows.map((r) => r.material_id)}
                    onPick={(r) => setRows((rs) => [...rs, r])}
                />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
                {hayError && (
                    <span className="text-sm text-destructive mr-auto">
                        Corregí las cantidades marcadas
                    </span>
                )}
                {onCancel && (
                    <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
                        Cancelar
                    </Button>
                )}
                <Button size="sm" onClick={descontar} disabled={saving || hayError || aDescontar.length === 0}>
                    {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Descontar
                </Button>
            </div>
        </>
    )
}
