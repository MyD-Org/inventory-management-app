"use client"

// Formulario de descuento de materiales por un pedido. Lo usan las dos entradas
// (el detalle del pedido y Salida de Stock) para que se comporten igual.
//
// Las cantidades se guardan como TEXTO, no como número: si se guardaran como
// número, borrar el campo daría Number("") = 0 y aparecería un cero pegado que
// hay que borrar antes de escribir.

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useListNavigation } from "@/hooks/use-list-navigation"
import { Camera, Loader2, X } from "lucide-react"
import { consumeOrderMaterials, searchInventoryMaterials } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import type { MaterialNeed } from "@/lib/orders"
import { OperatorPicker, type OperarioElegido } from "@/components/operator-picker"

// zxing pesa: se carga recién cuando alguien abre la cámara, no en cada pedido.
const CameraBarcodeScanner = dynamic(
    () => import("@/components/camera-barcode-scanner").then((m) => m.CameraBarcodeScanner),
    { ssr: false },
)

interface Alternative {
    material_id: number
    label: string
    available: number | null
    barcode: string
}

interface Row {
    key: string
    material_id: number
    label: string
    qty: string
    available: number | null
    /** Cómo se mide el material, ya abreviado ("u.", "m", "kg"). */
    unit: string
    /** Código de barras, para ir a buscarlo al depósito. '' si el material no tiene. */
    barcode: string
    /** Lo que pide el pedido. null en las filas agregadas a mano. */
    pending: number | null
    /** Opciones cuando la línea viene de una familia con varios materiales por color. */
    alternatives: Alternative[]
}

// Todo lo que se cuenta de a uno se muestra "u.". Hoy en el inventario eso es
// todo (Unidad, Pieza, No aplica), pero la unidad se lee del material igual: el
// día que entre algo por metro o por kilo, decir "2 u." de una tira mandaría a
// buscar cualquier cosa al depósito.
function abreviarUnidad(unit: string | null): string {
    const u = (unit ?? "").trim().toLowerCase()
    const porUnidad = ["", "u", "u.", "unidad", "unidades", "pieza", "piezas", "no aplica"]
    if (porUnidad.includes(u)) return "u."
    if (u === "metro" || u === "metros") return "m"
    return u
}

interface Hallazgo {
    material_id: number
    label: string
    barcode: string
    available: number
}

function AgregarMaterial({ onPick, yaEstan }: { onPick: (r: Row) => void; yaEstan: number[] }) {
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<Hallazgo[]>([])
    const [buscando, setBuscando] = useState(false)
    const [abierto, setAbierto] = useState(false)
    const [camaraAbierta, setCamaraAbierta] = useState(false)
    const [aviso, setAviso] = useState<string | null>(null)
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

    function agregar(r: Hallazgo) {
        onPick({
            key: `extra:${r.material_id}`,
            material_id: r.material_id,
            label: r.label,
            available: r.available,
            qty: "1",
            unit: "u.",
            barcode: r.barcode,
            pending: null,
            alternatives: [],
        })
        setQuery("")
        setResults([])
        setAviso(null)
        setAbierto(false)
    }

    // Lo que llega de la cámara es un código exacto, no algo a medio escribir:
    // si hay un material con ese código se agrega solo, sin pasar por la lista.
    // Si no, el código queda escrito en el campo para seguir a mano.
    async function escaneado(code: string) {
        const codigo = code.trim()
        setCamaraAbierta(false)
        setQuery(codigo)
        setBuscando(true)
        const encontrados = await searchInventoryMaterials(codigo)
        setBuscando(false)
        setResults(encontrados)

        const exacto = encontrados.find((r) => r.barcode.trim() === codigo)
        if (exacto && yaEstan.includes(exacto.material_id)) {
            setAviso(`${exacto.label} ya está en la lista`)
            return
        }
        if (exacto) {
            agregar(exacto)
            return
        }
        setAviso(
            encontrados.length > 0
                ? "Ningún material tiene ese código exacto. Elegí de la lista."
                : `No hay ningún material con el código ${codigo}`,
        )
        setAbierto(true)
    }

    // La lista se arma acá y no dentro del JSX: el teclado necesita el mismo
    // arreglo que se dibuja para saber qué está eligiendo.
    const opciones = results.filter((r) => !yaEstan.includes(r.material_id))
    const listaAbierta = abierto && opciones.length > 0

    const nav = useListNavigation({
        count: opciones.length,
        open: listaAbierta,
        onSelect: (i) => {
            const r = opciones[i]
            if (!r) return
            agregar(r)
        },
        onClose: () => setAbierto(false),
    })

    return (
        <div ref={boxRef} className="relative">
            <div className="flex gap-2">
                <Input
                    value={query}
                    autoComplete="off"
                    placeholder="Agregar otro material: nombre o código"
                    className="h-9 flex-1 text-base"
                    onFocus={() => setAbierto(true)}
                    onKeyDown={nav.onKeyDown}
                    role="combobox"
                    aria-expanded={listaAbierta}
                    aria-autocomplete="list"
                    onChange={(e) => {
                        setQuery(e.target.value)
                        setAviso(null)
                        setAbierto(true)
                    }}
                />
                <Button
                    type="button"
                    size="icon"
                    variant={camaraAbierta ? "secondary" : "outline"}
                    className="h-9 w-9 shrink-0"
                    onClick={() => {
                        setAviso(null)
                        setCamaraAbierta((v) => !v)
                    }}
                    title="Escanear con la cámara"
                    aria-label="Escanear con la cámara"
                >
                    <Camera className="h-4 w-4" />
                </Button>
            </div>
            {buscando && (
                <Loader2 className="absolute right-12 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}

            {camaraAbierta && (
                <div className="mt-2">
                    <CameraBarcodeScanner
                        onDetect={escaneado}
                        onClose={() => setCamaraAbierta(false)}
                    />
                </div>
            )}

            {aviso && <p className="mt-1 text-sm text-muted-foreground">{aviso}</p>}

            {listaAbierta && (
                <div
                    ref={nav.listRef}
                    role="listbox"
                    className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden"
                >
                    {opciones.map((r, i) => (
                            <button
                                key={r.material_id}
                                type="button"
                                data-index={i}
                                role="option"
                                aria-selected={nav.active === i}
                                onMouseEnter={() => nav.setActive(i)}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                                    nav.active === i ? "bg-muted" : ""
                                }`}
                                onClick={() => agregar(r)}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-base">{r.label}</span>
                                    {r.barcode && (
                                        <span className="block truncate font-mono text-xs text-muted-foreground">
                                            {r.barcode}
                                        </span>
                                    )}
                                </span>
                                <span className="text-sm text-muted-foreground shrink-0">
                                    {r.available} en stock
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

    // Quién retira el material. El taller entra con una sesión compartida, así
    // que la cuenta no alcanza para saber quién se llevó qué. Ver
    // components/operator-picker.tsx.
    const [operario, setOperario] = useState<OperarioElegido | null>(null)
    const [operarioRequerido, setOperarioRequerido] = useState(false)
    const [operarioError, setOperarioError] = useState(false)
    useEffect(() => {
        setRows(
            needs
                .filter((n) => n.material_id !== null && n.pending > 0)
                .map((n) => {
                    const key = n.family_id !== null ? `fam:${n.family_id}:${n.spec_value}` : `mat:${n.material_id}`
                    return {
                        key,
                        material_id: n.material_id!,
                        label: n.label,
                        // Sugerimos lo pendiente, sin pasarnos de lo que hay.
                        qty: String(Math.min(n.pending, n.available ?? n.pending)),
                        available: n.available,
                        unit: abreviarUnidad(n.unit),
                        barcode: n.barcode,
                        pending: n.pending,
                        alternatives: n.alternatives,
                    }
                }),
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
        if (r.available !== null && n > r.available) return `Solo hay ${r.available} ${r.unit}`
        return null
    }

    const hayError = rows.some((r) => errorDe(r) !== null)
    const aDescontar = rows.filter((r) => {
        const n = parsear(r.qty)
        return !Number.isNaN(n) && n > 0
    })

    async function descontar() {
        if (operarioRequerido && !operario) {
            setOperarioError(true)
            toast.error("Falta el operario", { description: "Tocá quién está retirando el material." })
            return
        }
        setSaving(true)
        const result = await consumeOrderMaterials(
            orderId,
            aDescontar.map((r) => ({ material_id: r.material_id, quantity: parsear(r.qty) })),
            operario?.id ?? null,
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
            <div className="mb-4">
                <OperatorPicker
                    value={operario}
                    onChange={(op) => {
                        setOperario(op)
                        if (op) setOperarioError(false)
                    }}
                    onRequirement={setOperarioRequerido}
                    error={operarioError}
                    disabled={saving}
                />
            </div>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                {rows.map((r, idx) => {
                    const error = errorDe(r)
                    const showSelector = r.alternatives.length > 1
                    return (
                        <div key={r.key} className="flex items-start gap-3">
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
                                {showSelector ? (
                                    <Select
                                        value={String(r.material_id)}
                                        onValueChange={(v) => {
                                            const selected = r.alternatives.find((a) => a.material_id === Number(v))
                                            if (!selected) return
                                            setRows((rs) =>
                                                rs.map((x, i) =>
                                                    i === idx
                                                        ? {
                                                              ...x,
                                                              material_id: selected.material_id,
                                                              label: selected.label,
                                                              available: selected.available,
                                                              barcode: selected.barcode,
                                                          }
                                                        : x,
                                                ),
                                            )
                                        }}
                                    >
                                        <SelectTrigger className="h-9 w-full min-w-0 text-base">
                                            {/* Dos motivos por los que esta fila se montaba
                                                encima del stock de la derecha: el SelectTrigger de
                                                shadcn es w-fit y crece con la etiqueta (de ahí el
                                                w-full), y SelectValue sin hijos dibuja los del
                                                SelectItem elegido, o sea etiqueta + stock. Acá va
                                                solo el nombre, truncado. */}
                                            <SelectValue>
                                                <span className="block truncate text-left">{r.label}</span>
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {r.alternatives.map((a) => (
                                                <SelectItem key={a.material_id} value={String(a.material_id)}>
                                                    <span className="truncate">{a.label}</span>
                                                    <span className="ml-2 shrink-0 text-sm text-muted-foreground">
                                                        {a.available ?? "—"} en stock
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="text-base truncate">{r.label}</div>
                                )}
                                {/* El código es con lo que se encuentra el material en el
                                    depósito: va debajo del nombre, en monoespaciada, para
                                    poder compararlo dígito a dígito con la etiqueta. */}
                                {r.barcode && (
                                    <div className="font-mono text-sm text-muted-foreground truncate">
                                        {r.barcode}
                                    </div>
                                )}
                                {error ? (
                                    <div className="text-sm text-destructive">{error}</div>
                                ) : (
                                    faltaStock(r) && (
                                        <div className="text-sm text-destructive">
                                            {r.available === 0
                                                ? "No hay stock de este material"
                                                : `Faltan ${r.pending! - r.available!} ${r.unit}`}
                                        </div>
                                    )
                                )}
                            </div>

                            {/* Solo el stock. Cuánto lleva el pedido ya está en el input de
                                la izquierda, y cuando no alcanza lo explica la línea roja de
                                abajo; repetirlo acá ("necesita 3 · hay 1") apretaba la fila y
                                se leía como un jeroglífico. */}
                            <span
                                className={`text-sm shrink-0 whitespace-nowrap pt-1.5 ${
                                    faltaStock(r) ? "text-destructive" : "text-muted-foreground"
                                }`}
                            >
                                {r.available ?? "—"} en stock
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
