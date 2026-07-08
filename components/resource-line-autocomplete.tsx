"use client"

// Buscador de recurso de mano de obra por línea (client-side sobre la lista precargada,
// con búsqueda difusa que tolera acentos y typos). La mano de obra SOLO admite recursos
// ya cargados: si lo escrito no coincide con ninguno, la línea queda inválida y no se
// puede guardar hasta elegir uno existente (o crearlo en Mano de Obra).

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { fuzzyFilter } from "@/lib/fuzzy"

export interface ResourceOption {
    id: number
    name: string
    hint?: string
}

export function ResourceLineAutocomplete({
    value,
    options,
    linked,
    onPick,
    onText,
}: {
    value: string
    options: ResourceOption[]
    linked: boolean // true si el texto actual corresponde a un recurso elegido de la lista
    onPick: (id: number) => void
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

    const matches = fuzzyFilter(options, value, ["name"], 8)
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
                placeholder="Buscar recurso de mano de obra…"
                aria-invalid={invalid}
                className={invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
            {open && (
                <div className="absolute z-30 mt-1 w-full min-w-[240px] rounded-md border bg-popover shadow-md max-h-60 overflow-auto">
                    {matches.map((o) => (
                        <button
                            key={o.id}
                            type="button"
                            onClick={() => {
                                onPick(o.id)
                                setOpen(false)
                            }}
                            className="flex w-full items-center justify-between gap-3 p-2.5 text-left text-sm hover:bg-muted"
                        >
                            <span className="truncate">{o.name}</span>
                            {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
                        </button>
                    ))}
                    {value.trim() !== "" && matches.length === 0 && (
                        <p className="px-3 pt-2.5 text-sm text-muted-foreground">Ese recurso no existe todavía.</p>
                    )}
                    {/* La mano de obra solo usa recursos ya cargados: acceso directo a crearlos. */}
                    <Link
                        href="/settings/recursos"
                        className="flex items-center gap-2 border-t p-2.5 text-sm font-medium text-primary hover:bg-muted"
                        onClick={() => setOpen(false)}
                    >
                        <Plus className="h-4 w-4" />
                        Crear un recurso de mano de obra
                    </Link>
                </div>
            )}
        </div>
    )
}
