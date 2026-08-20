"use client"

// Elegir un producto escribiendo. Sugiere los que YA tienen hoja de costo, pero
// deja cargar uno nuevo: a veces el pedido entra antes de que exista la receta.
// Esa línea queda marcada "sin receta" y sin lista de materiales hasta que se
// cargue el costo.

import { useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"

export function ProductPicker({
    products,
    onPick,
    onCancel,
    autoFocus = true,
    placeholder = "Escribí el nombre del producto",
}: {
    products: string[]
    onPick: (product: string) => void
    onCancel?: () => void
    autoFocus?: boolean
    placeholder?: string
}) {
    const [query, setQuery] = useState("")
    const [cursor, setCursor] = useState(0)
    const boxRef = useRef<HTMLDivElement>(null)

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase()
        const list = q ? products.filter((p) => p.toLowerCase().includes(q)) : products
        return list.slice(0, 8)
    }, [products, query])

    // Ofrecemos crearlo salvo que ya exista con ese nombre exacto.
    const nuevo = query.trim()
    const ofrecerNuevo =
        nuevo.length > 0 && !products.some((p) => p.toLowerCase() === nuevo.toLowerCase())

    useEffect(() => setCursor(0), [query])

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) onCancel?.()
        }
        document.addEventListener("mousedown", onClickOutside)
        return () => document.removeEventListener("mousedown", onClickOutside)
    }, [onCancel])

    return (
        <div ref={boxRef} className="relative flex-1 min-w-0">
            <Input
                autoFocus={autoFocus}
                autoComplete="off"
                className="h-8 text-[13px]"
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                        e.preventDefault()
                        setCursor((c) => Math.min(c + 1, matches.length - 1))
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault()
                        setCursor((c) => Math.max(c - 1, 0))
                    } else if (e.key === "Enter") {
                        e.preventDefault()
                        if (matches[cursor]) onPick(matches[cursor])
                        else if (ofrecerNuevo) onPick(nuevo)
                    } else if (e.key === "Escape") {
                        e.preventDefault()
                        onCancel?.()
                    }
                }}
            />

            <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                {matches.map((p, i) => (
                    <button
                        key={p}
                        type="button"
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => onPick(p)}
                        className={`block w-full px-3 py-1.5 text-left text-[13px] ${
                            i === cursor ? "bg-muted" : ""
                        }`}
                    >
                        {p}
                    </button>
                ))}
                {ofrecerNuevo && (
                    <button
                        type="button"
                        onClick={() => onPick(nuevo)}
                        className={`block w-full px-3 py-1.5 text-left text-[13px] ${
                            matches.length > 0 ? "border-t" : ""
                        }`}
                    >
                        Usar <strong>{nuevo}</strong>
                        <span className="text-muted-foreground"> · producto nuevo, queda sin receta</span>
                    </button>
                )}
                {matches.length === 0 && !ofrecerNuevo && (
                    <p className="px-3 py-2 text-[12px] text-muted-foreground">
                        Escribí para buscar o cargar un producto.
                    </p>
                )}
            </div>
        </div>
    )
}
