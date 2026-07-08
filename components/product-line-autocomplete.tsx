"use client"

// Buscador de producto por línea (estilo factura). Filtra en el cliente el catálogo de
// productos costeados con búsqueda difusa (tolera acentos y typos). El presupuesto SOLO
// admite productos ya costeados: si lo que se escribe no coincide con ninguno, la línea
// queda marcada como inválida y no se puede guardar hasta elegir uno existente (o crearlo
// en Calcular Costos).

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { formatArs } from "@/lib/format"
import { fuzzyFilter } from "@/lib/fuzzy"
import type { CostedProduct } from "@/components/quote-editor"

export function ProductLineAutocomplete({
    value,
    products,
    linked,
    onPick,
    onText,
}: {
    value: string
    products: CostedProduct[]
    linked: boolean // true si el texto actual corresponde a un producto elegido de la lista
    onPick: (p: CostedProduct) => void
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

    const matches = fuzzyFilter(products, value, ["name"], 8)
    // Texto cargado que no corresponde a ningún producto elegido → inválido.
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
                placeholder="Buscar producto o servicio…"
                aria-invalid={invalid}
                className={invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
            {open && (
                <div className="absolute z-30 mt-1 w-full min-w-[240px] rounded-md border bg-popover shadow-md max-h-60 overflow-auto">
                    {matches.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                                onPick(p)
                                setOpen(false)
                            }}
                            className="flex w-full items-center justify-between gap-3 p-2.5 text-left text-sm hover:bg-muted"
                        >
                            <span className="truncate">{p.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatArs(p.salePrice)}</span>
                        </button>
                    ))}
                    {value.trim() !== "" && matches.length === 0 && (
                        <p className="px-3 pt-2.5 text-sm text-muted-foreground">Ese producto no existe todavía.</p>
                    )}
                    {/* Presupuestos solo usa productos ya costeados: acceso directo a crearlo. */}
                    <Link
                        href="/costos/nuevo"
                        className="flex items-center gap-2 border-t p-2.5 text-sm font-medium text-primary hover:bg-muted"
                        onClick={() => setOpen(false)}
                    >
                        <Plus className="h-4 w-4" />
                        Calcular el costo de un producto nuevo
                    </Link>
                </div>
            )}
        </div>
    )
}
