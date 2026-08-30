"use client"

// Buscador de material por línea. Filtra en el cliente el catálogo de inventario ya
// cargado (lo trae el editor con getMaterialsCatalog) con búsqueda difusa: tolera acentos
// y typos ("cañeria"/"caneria", "sodadura"→"soldadura"). El cálculo de costos SOLO admite
// materiales del inventario: si lo escrito no corresponde a uno elegido de la lista, la
// línea queda inválida y no se puede guardar hasta elegir uno existente (o crearlo).

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { useListNavigation } from "@/hooks/use-list-navigation"
import { Layers, Plus } from "lucide-react"
import { formatArs } from "@/lib/format"
import { fuzzyFilter } from "@/lib/fuzzy"

// Una familia como opción del buscador: no es un material del inventario, es la
// plantilla que arma la línea entera (nombre general + campo que la hace variar +
// todas sus variantes). Se ofrece ARRIBA de los materiales sueltos porque cargar
// la familia es casi siempre lo correcto cuando existe: elegir a mano una de sus
// variantes deja la línea atada a un solo color.
export interface FamilySearchResult {
    id: number
    name: string
    fieldLabel: string
    variantCount: number
    unitCost: number
}

export interface MaterialSearchResult {
    id: number
    name: string
    barcode: string
    unit_of_measure: string
    unit_cost: number
    available_stock: number
}

export function MaterialLineAutocomplete({
    value,
    catalog,
    families = [],
    linked,
    onPick,
    onPickFamily,
    onText,
}: {
    value: string
    catalog: MaterialSearchResult[] // inventario completo, cargado una vez por el editor
    families?: FamilySearchResult[] // familias de materiales; vacío si el que llama no las usa
    linked: boolean // true si el texto actual corresponde a un material elegido de la lista
    onPick: (m: MaterialSearchResult) => void
    onPickFamily?: (f: FamilySearchResult) => void
    onText: (text: string) => void
}) {
    const [open, setOpen] = useState(false)
    const boxRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", onDoc)
        return () => document.removeEventListener("mousedown", onDoc)
    }, [])

    // Busca por nombre y por código de barras, difuso y sin acentos.
    const matches = fuzzyFilter(catalog, value, ["name", "barcode"], 12)
    const familyMatches = onPickFamily ? fuzzyFilter(families, value, ["name"], 4) : []
    const invalid = value.trim() !== "" && !linked

    // Las familias van primero en la lista, así que también primero en el
    // recorrido con las flechas: el índice de teclado es familias + materiales.
    const nav = useListNavigation({
        count: familyMatches.length + matches.length,
        open,
        onSelect: (i) => {
            const family = familyMatches[i]
            if (family) {
                onPickFamily?.(family)
                setOpen(false)
                return
            }
            const material = matches[i - familyMatches.length]
            if (!material) return
            onPick(material)
            setOpen(false)
        },
        onClose: () => setOpen(false),
    })

    return (
        <div className="relative" ref={boxRef}>
            <Input
                // Chrome abriría su historial encima de nuestra lista.
                autoComplete="off"
                value={value}
                onChange={(e) => {
                    onText(e.target.value)
                    setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={nav.onKeyDown}
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                placeholder="Buscar material (nombre o código)…"
                aria-invalid={invalid}
                className={invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
            {open && (
                <div
                    ref={nav.listRef}
                    role="listbox"
                    className="absolute z-30 mt-1 w-full min-w-[280px] rounded-md border bg-popover shadow-md max-h-60 overflow-auto"
                >
                    {familyMatches.map((f, i) => (
                        <button
                            key={`family-${f.id}`}
                            type="button"
                            data-index={i}
                            role="option"
                            aria-selected={nav.active === i}
                            onMouseEnter={() => nav.setActive(i)}
                            onClick={() => {
                                onPickFamily?.(f)
                                setOpen(false)
                            }}
                            className={`flex w-full items-start justify-between gap-2 border-b p-2.5 text-left text-sm ${
                                nav.active === i ? "bg-muted" : ""
                            }`}
                        >
                            {/* En dos renglones: el desplegable es angosto y el nombre de
                                la familia no puede pelear el ancho con el "varía según". */}
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
                                    <span className="min-w-0 truncate font-medium">{f.name}</span>
                                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                        familia
                                    </span>
                                </span>
                                <span className="pl-5 text-xs text-muted-foreground">
                                    varía según {f.fieldLabel} · {f.variantCount}{" "}
                                    {f.variantCount === 1 ? "variante" : "variantes"}
                                </span>
                            </span>
                        </button>
                    ))}
                    {matches.map((r, i) => (
                        <button
                            key={r.id}
                            type="button"
                            data-index={familyMatches.length + i}
                            role="option"
                            aria-selected={nav.active === familyMatches.length + i}
                            onMouseEnter={() => nav.setActive(familyMatches.length + i)}
                            onClick={() => {
                                onPick(r)
                                setOpen(false)
                            }}
                            className={`flex w-full items-center justify-between gap-2 p-2.5 text-left text-sm ${
                                nav.active === familyMatches.length + i ? "bg-muted" : ""
                            }`}
                        >
                            <span className="min-w-0 truncate">
                                <span className="font-medium">{r.name}</span>
                                <span className="ml-2 font-mono text-xs text-muted-foreground">{r.barcode}</span>
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                                {formatArs(Number(r.unit_cost))} · stock {r.available_stock}
                            </span>
                        </button>
                    ))}
                    {value.trim() !== "" && matches.length === 0 && familyMatches.length === 0 && (
                        <p className="px-3 pt-2.5 text-sm text-muted-foreground">Ese material no existe en el inventario.</p>
                    )}
                    {/* El cálculo de costos solo usa materiales del inventario: acceso directo a crearlo. */}
                    <Link
                        href="/materials/nuevo"
                        className="flex items-center gap-2 border-t p-2.5 text-sm font-medium text-primary hover:bg-muted"
                        onClick={() => setOpen(false)}
                    >
                        <Plus className="h-4 w-4" />
                        Crear un material nuevo
                    </Link>
                </div>
            )}
        </div>
    )
}
