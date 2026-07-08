"use client"

// Campo "Cliente" con autocompletado contra los contactos de Alegra (cuando está
// configurado). Permite escribir libre (cliente que no está en Alegra) o elegir uno
// de la lista; al elegir, se guarda el id del contacto para reutilizarlo al crear la
// cotización en Alegra (sin volver a buscar).

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Loader2, Check } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { searchAlegraContacts } from "@/lib/alegra-actions"

interface Contact {
    id: number
    name: string
}

export function CustomerAutocomplete({
    value,
    contactId,
    onChange,
    onSelect,
    enabled,
}: {
    value: string
    contactId: number | null
    onChange: (name: string) => void          // texto libre (deselecciona el contacto)
    onSelect: (contact: Contact | null) => void // eligió/limpió un contacto de Alegra
    enabled: boolean
}) {
    const [results, setResults] = useState<Contact[]>([])
    const [searching, setSearching] = useState(false)
    const [open, setOpen] = useState(false)
    const boxRef = useRef<HTMLDivElement>(null)

    // Cerrar el dropdown al hacer click afuera.
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
        const { contacts } = await searchAlegraContacts(q)
        setResults(contacts as Contact[])
        setSearching(false)
    }, 350)

    const handleChange = (q: string) => {
        onChange(q)          // texto libre → deselecciona contacto
        onSelect(null)
        if (!enabled) return
        setOpen(true)
        setSearching(true)
        runSearch(q)
    }

    const pick = (c: Contact) => {
        onSelect(c)
        onChange(c.name)
        setOpen(false)
    }

    return (
        <div className="relative" ref={boxRef}>
            <Input
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => { if (enabled && results.length) setOpen(true) }}
                placeholder={enabled ? "Buscar cliente en Alegra o escribir uno nuevo…" : "Nombre del cliente"}
            />
            {contactId != null && (
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
                    {!searching && results.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => pick(c)}
                            className="w-full text-left p-2.5 hover:bg-muted text-sm"
                        >
                            {c.name}
                        </button>
                    ))}
                    {!searching && results.length === 0 && (
                        <div className="p-3 text-sm text-muted-foreground">
                            Sin contactos en Alegra. Se usará como cliente nuevo (podés crearlo al cotizar).
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
