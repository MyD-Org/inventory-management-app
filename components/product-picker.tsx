"use client"

// Elegir un producto escribiendo. Sugiere los que ya tienen el costo cargado,
// pero deja escribir uno nuevo: a veces el pedido entra antes. Esa línea queda
// sin lista de materiales hasta que se cargue el costo del producto.

import { useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ProductPicker({
    products,
    onPick,
    onCancel,
    // Por defecto NO enfoca ni despliega: se abre al hacer foco, igual que el
    // buscador de clientes. Se enfoca solo cuando el usuario pidió agregar.
    autoFocus = false,
    label,
    placeholder = "Buscá o escribí un producto",
}: {
    products: string[]
    onPick: (product: string) => void
    onCancel?: () => void
    autoFocus?: boolean
    label?: string
    placeholder?: string
}) {
    const [query, setQuery] = useState("")
    const [open, setOpen] = useState(autoFocus)
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
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
                setOpen(false)
                onCancel?.()
            }
        }
        document.addEventListener("mousedown", onClickOutside)
        return () => document.removeEventListener("mousedown", onClickOutside)
    }, [onCancel])

    return (
        <div ref={boxRef} className="relative flex-1 min-w-0">
            {label && <Label htmlFor="producto">{label}</Label>}
            <Input
                id="producto"
                autoFocus={autoFocus}
                autoComplete="off"
                className={label ? "mt-1.5" : "h-8 text-[13px]"}
                placeholder={placeholder}
                value={query}
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                    setQuery(e.target.value)
                    setOpen(true)
                }}
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
                        setOpen(false)
                        onCancel?.()
                    }
                }}
            />

            {open && (
            <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                {matches.map((p, i) => (
                    <button
                        key={p}
                        type="button"
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => {
                            setOpen(false)
                            onPick(p)
                        }}
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
                        onClick={() => {
                            setOpen(false)
                            onPick(nuevo)
                        }}
                        className={`block w-full px-3 py-1.5 text-left text-[13px] ${
                            matches.length > 0 ? "border-t" : ""
                        }`}
                    >
                        Usar <strong>{nuevo}</strong>
                        <span className="text-muted-foreground"> · producto nuevo</span>
                    </button>
                )}
                {matches.length === 0 && !ofrecerNuevo && (
                    <p className="px-3 py-2 text-[12px] text-muted-foreground">
                        Escribí el nombre del producto.
                    </p>
                )}
            </div>
            )}
        </div>
    )
}
