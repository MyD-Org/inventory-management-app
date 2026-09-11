"use client"

// Buscador de material por línea. Filtra en el cliente el catálogo de inventario ya
// cargado (lo trae el editor con getMaterialsCatalog) con búsqueda difusa: tolera acentos
// y typos ("cañeria"/"caneria", "sodadura"→"soldadura"). El cálculo de costos SOLO admite
// materiales del inventario: si lo escrito no corresponde a uno elegido de la lista, la
// línea queda inválida y no se puede guardar hasta elegir uno existente (o crearlo).

import { useRef, useState } from "react"
import Link from "next/link"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { useListNavigation } from "@/hooks/use-list-navigation"
import { Layers, Plus } from "lucide-react"
import { formatArs, formatStock } from "@/lib/format"
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
    freeText = false,
    placeholder = "Buscar material (nombre o código)…",
    onPick,
    onPickFamily,
    onText,
}: {
    value: string
    catalog: MaterialSearchResult[] // inventario completo, cargado una vez por el editor
    families?: FamilySearchResult[] // familias de materiales; vacío si el que llama no las usa
    linked: boolean // true si el texto actual corresponde a un material elegido de la lista
    // true donde escribir algo que no es del inventario es una carga válida y no un
    // error a corregir (Otros costos: "flete" es una línea perfectamente legítima).
    // Sin esto el campo se pinta de rojo y avisa que el material no existe.
    freeText?: boolean
    placeholder?: string
    onPick: (m: MaterialSearchResult) => void
    onPickFamily?: (f: FamilySearchResult) => void
    onText: (text: string) => void
}) {
    const [open, setOpen] = useState(false)
    const boxRef = useRef<HTMLDivElement>(null)

    // Busca por nombre y por código de barras, difuso y sin acentos.
    const matches = fuzzyFilter(catalog, value, ["name", "barcode"], 12)
    const familyMatches = onPickFamily ? fuzzyFilter(families, value, ["name"], 4) : []
    const invalid = !freeText && value.trim() !== "" && !linked

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

    // La lista va en un Popover (portal) y no absoluta adentro del campo: en el
    // modal de familias el contenido tiene overflow-y-auto y la recortaba, quedaba
    // escondida abajo del borde del modal. Radix además la trata como parte del
    // Dialog, así que elegir un material no cierra el modal.
    return (
        <Popover open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Anchor asChild>
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
                placeholder={placeholder}
                aria-invalid={invalid}
                className={invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
        </div>
        </PopoverPrimitive.Anchor>
            <PopoverContent
                align="start"
                className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
                // El foco se queda en el campo para seguir escribiendo.
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                // Tocar el propio campo no cuenta como "afuera".
                onInteractOutside={(e) => {
                    if (boxRef.current?.contains(e.target as Node)) e.preventDefault()
                }}
                // El Dialog bloquea la rueda fuera de su contenido; sin esto la
                // lista no se podía desplazar dentro del modal.
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
            >
                <div
                    ref={nav.listRef}
                    role="listbox"
                    className="max-h-60 overflow-auto"
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
                                {formatArs(Number(r.unit_cost))} · stock {formatStock(r.available_stock)}
                            </span>
                        </button>
                    ))}
                    {value.trim() !== "" && matches.length === 0 && familyMatches.length === 0 && (
                        <p className="px-3 pt-2.5 text-sm text-muted-foreground">
                            {freeText
                                ? "No hay un material con ese nombre. Podés dejarlo como costo escrito a mano."
                                : "Ese material no existe en el inventario."}
                        </p>
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
            </PopoverContent>
        </Popover>
    )
}
