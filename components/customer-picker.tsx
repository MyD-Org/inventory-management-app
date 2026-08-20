"use client"

// Buscador de clientes contra el espejo de Alegra. Si el cliente no está (alguien
// nuevo del mostrador), se puede escribir el nombre igual: el id se deriva solo.

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Loader2, User } from "lucide-react"
import { searchCustomers } from "@/lib/order-actions"

export interface PickedCustomer {
    external_id: string
    name: string
    phone: string | null
}

export function CustomerPicker({
    value,
    onChange,
}: {
    value: PickedCustomer | null
    onChange: (c: PickedCustomer | null) => void
}) {
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<PickedCustomer[]>([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const boxRef = useRef<HTMLDivElement>(null)

    // Debounce: no consultamos en cada tecla.
    useEffect(() => {
        if (query.trim().length < 2) {
            setResults([])
            return
        }
        setLoading(true)
        const t = setTimeout(async () => {
            setResults(await searchCustomers(query))
            setLoading(false)
        }, 250)
        return () => clearTimeout(t)
    }, [query])

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", onClickOutside)
        return () => document.removeEventListener("mousedown", onClickOutside)
    }, [])

    if (value) {
        return (
            <div>
                <Label>Cliente</Label>
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 mt-1.5">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">{value.name}</div>
                        <div className="text-[12px] text-muted-foreground truncate">
                            {value.external_id}
                            {value.phone && ` · ${value.phone}`}
                        </div>
                    </div>
                    <button
                        type="button"
                        className="text-[12px] text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => {
                            onChange(null)
                            setQuery("")
                        }}
                    >
                        Cambiar
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div ref={boxRef} className="relative">
            <Label htmlFor="cliente">Cliente</Label>
            <Input
                id="cliente"
                className="mt-1.5"
                autoComplete="off"
                placeholder="Buscá por nombre"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value)
                    setOpen(true)
                }}
                onFocus={() => setOpen(true)}
            />
            {loading && (
                <Loader2 className="absolute right-3 top-[38px] h-4 w-4 animate-spin text-muted-foreground" />
            )}

            {open && query.trim().length >= 2 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                    {results.map((c) => (
                        <button
                            key={c.external_id}
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                            onClick={() => {
                                onChange(c)
                                setOpen(false)
                            }}
                        >
                            <Check className="h-3.5 w-3.5 opacity-0" />
                            <div className="min-w-0">
                                <div className="text-[13px] truncate">{c.name}</div>
                                {c.phone && (
                                    <div className="text-[11px] text-muted-foreground truncate">{c.phone}</div>
                                )}
                            </div>
                        </button>
                    ))}

                    {/* Cliente que todavía no está en Alegra */}
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 border-t px-3 py-2 text-left hover:bg-muted"
                        onClick={() => {
                            onChange({ external_id: "", name: query.trim(), phone: null })
                            setOpen(false)
                        }}
                    >
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[13px]">
                            Usar <strong>{query.trim()}</strong> como cliente nuevo
                        </span>
                    </button>
                </div>
            )}
        </div>
    )
}
