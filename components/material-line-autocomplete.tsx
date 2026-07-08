"use client"

// Buscador de material por línea. Filtra en el cliente el catálogo de inventario ya
// cargado (lo trae el editor con getMaterialsCatalog) con búsqueda difusa: tolera acentos
// y typos ("cañeria"/"caneria", "sodadura"→"soldadura"). El cálculo de costos SOLO admite
// materiales del inventario: si lo escrito no corresponde a uno elegido de la lista, la
// línea queda inválida y no se puede guardar hasta elegir uno existente (o crearlo).

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Plus } from "lucide-react"
import { formatArs } from "@/lib/format"
import { fuzzyFilter } from "@/lib/fuzzy"

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
    linked,
    onPick,
    onText,
}: {
    value: string
    catalog: MaterialSearchResult[] // inventario completo, cargado una vez por el editor
    linked: boolean // true si el texto actual corresponde a un material elegido de la lista
    onPick: (m: MaterialSearchResult) => void
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
    const invalid = value.trim() !== "" && !linked

    return (
        <div className="relative" ref={boxRef}>
            <Input
                value={value}
                onChange={(e) => {
                    onText(e.target.value)
                    setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                placeholder="Buscar material (nombre o código)…"
                aria-invalid={invalid}
                className={invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
            {open && (
                <div className="absolute z-30 mt-1 w-full min-w-[280px] rounded-md border bg-popover shadow-md max-h-60 overflow-auto">
                    {matches.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                                onPick(r)
                                setOpen(false)
                            }}
                            className="flex w-full items-center justify-between gap-2 p-2.5 text-left text-sm hover:bg-muted"
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
                    {value.trim() !== "" && matches.length === 0 && (
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
