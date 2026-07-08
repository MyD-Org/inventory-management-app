"use client"

// Campo "Nombre" del producto en el editor de costos, con autocompletado contra los
// productos (items) de Alegra. Si el producto ya existe en Alegra se vincula
// (budgets.alegra_item_id) → al cotizar se reutiliza sin duplicar. Si no existe, queda
// como producto nuevo (se creará en Alegra al momento de cotizar). Permite texto libre.

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Loader2, Check } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { searchAlegraItems } from "@/lib/alegra-actions"

interface Item {
    id: number
    name: string
}

export function ProductNameAutocomplete({
    value,
    itemId,
    onChange,
    onSelect,
    enabled,
    invalid = false,
}: {
    value: string
    itemId: number | null
    onChange: (name: string) => void        // texto libre (deselecciona el item)
    onSelect: (item: Item | null) => void   // eligió/limpió un item de Alegra
    enabled: boolean
    invalid?: boolean                       // resalta el campo en rojo si falta
}) {
    const [results, setResults] = useState<Item[]>([])
    const [searching, setSearching] = useState(false)
    const [open, setOpen] = useState(false)
    // Si el plan de Alegra no habilita el catálogo de productos (402), el campo se
    // comporta como texto libre normal (sin dropdown ni errores).
    const [unavailable, setUnavailable] = useState(false)
    const boxRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", onDoc)
        return () => document.removeEventListener("mousedown", onDoc)
    }, [])

    const runSearch = useDebouncedCallback(async (q: string) => {
        if (!q.trim()) {
            setResults([])
            setSearching(false)
            return
        }
        const { items, error } = await searchAlegraItems(q)
        setSearching(false)
        if (error) {
            // Plan sin catálogo (402) u otro problema → degradar a texto libre.
            setUnavailable(true)
            setOpen(false)
            return
        }
        setResults(items as Item[])
    }, 350)

    const handleChange = (q: string) => {
        onChange(q)
        onSelect(null)
        if (!enabled || unavailable) return
        setOpen(true)
        setSearching(true)
        runSearch(q)
    }

    const pick = (it: Item) => {
        onSelect(it)
        onChange(it.name)
        setOpen(false)
    }

    return (
        <div className="relative" ref={boxRef}>
            <Input
                id="budget-name"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => { if (enabled && results.length) setOpen(true) }}
                placeholder='Ej: "Optic 1"'
                aria-invalid={invalid}
                className={invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
            {itemId != null && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-green-600">
                    <Check className="w-3.5 h-3.5" /> Alegra
                </span>
            )}
            {enabled && open && value.trim() && (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-auto">
                    {searching && (
                        <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Buscando en Alegra…
                        </div>
                    )}
                    {!searching && results.map((it) => (
                        <button
                            key={it.id}
                            type="button"
                            onClick={() => pick(it)}
                            className="w-full text-left p-2.5 hover:bg-muted text-sm"
                        >
                            {it.name}
                        </button>
                    ))}
                    {!searching && results.length === 0 && (
                        <div className="p-3 text-sm text-muted-foreground">
                            No está en Alegra. Queda como producto nuevo (se creará al cotizar).
                        </div>
                    )}
                </div>
            )}
            {enabled && !unavailable && itemId == null && value.trim() && !open && (
                <p className="text-xs text-muted-foreground mt-1">
                    Producto nuevo: se creará en Alegra al generar la cotización.
                </p>
            )}
        </div>
    )
}
