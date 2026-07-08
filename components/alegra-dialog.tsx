"use client"

// Diálogo "Crear en Alegra": desde un presupuesto guardado arma la cotización (estimate)
// en Alegra. Pasos dentro del mismo diálogo:
//   1. Elegir el cliente: buscador en vivo de contactos de Alegra (+ crear si no existe).
//   2. Revisar ítems: los vinculados se reutilizan; para los que no existen en Alegra
//      el usuario decide POR CADA UNO: crear el ítem o mandarlo como genérico.
//   3. Confirmar → toast con número + link a la cotización en Alegra.

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, UserPlus, ExternalLink, CheckCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useDebouncedCallback } from "use-debounce"
import { formatArs } from "@/lib/format"
import {
    searchAlegraContacts,
    createAlegraContact,
    getQuoteAlegraStatus,
    sendQuoteToAlegra,
    type AlegraSendDecision,
} from "@/lib/alegra-actions"

interface AlegraItemRow {
    id: number
    label: string
    qty: number
    unitPrice: number
    kind: "manual" | "linked" | "unlinked"
}

interface Contact {
    id: number
    name: string
}

export function AlegraDialog({
    quoteId,
    customerName,
    preselectedContact,
    open,
    onOpenChange,
}: {
    quoteId: number
    customerName: string
    preselectedContact?: Contact | null
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const router = useRouter()
    const { toast } = useToast()

    const [items, setItems] = useState<AlegraItemRow[]>([])
    const [loadingItems, setLoadingItems] = useState(false)
    const [decisions, setDecisions] = useState<Record<number, "create" | "generic">>({})

    const [contactQuery, setContactQuery] = useState(customerName)
    const [contacts, setContacts] = useState<Contact[]>([])
    const [searching, setSearching] = useState(false)
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
    const [creatingContact, setCreatingContact] = useState(false)
    const [sending, setSending] = useState(false)
    const [alegraError, setAlegraError] = useState<string | null>(null)

    // Cargar estado de los ítems al abrir + primera búsqueda con el nombre del cliente local.
    useEffect(() => {
        if (!open) return
        setAlegraError(null)
        setLoadingItems(true)
        void getQuoteAlegraStatus(quoteId).then(({ items: rows, error }) => {
            setLoadingItems(false)
            if (error) {
                setAlegraError(error)
                return
            }
            setItems(rows as AlegraItemRow[])
            // Default: crear (mantiene el catálogo de Alegra completo); el usuario puede cambiar.
            const d: Record<number, "create" | "generic"> = {}
            for (const r of rows as AlegraItemRow[]) if (r.kind === "unlinked") d[r.id] = "create"
            setDecisions(d)
        })

        // Si el cliente ya fue elegido desde el campo Cliente (autocompletado de Alegra),
        // arrancamos con ese contacto seleccionado y salteamos la búsqueda.
        if (preselectedContact) {
            setSelectedContact(preselectedContact)
            return
        }
        setSelectedContact(null)
        setContactQuery(customerName)
        if (customerName.trim()) {
            setSearching(true)
            void searchAlegraContacts(customerName).then(({ contacts: found, error }) => {
                setSearching(false)
                if (error) setAlegraError(error)
                else setContacts(found as Contact[])
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, quoteId])

    const runSearch = useDebouncedCallback(async (q: string) => {
        if (!q.trim()) {
            setContacts([])
            setSearching(false)
            return
        }
        const { contacts: found, error } = await searchAlegraContacts(q)
        setSearching(false)
        if (error) setAlegraError(error)
        else {
            setAlegraError(null)
            setContacts(found as Contact[])
        }
    }, 350)

    const onQueryChange = (q: string) => {
        setContactQuery(q)
        setSelectedContact(null)
        setSearching(true)
        runSearch(q)
    }

    const onCreateContact = async () => {
        setCreatingContact(true)
        const { contact, error } = await createAlegraContact(contactQuery)
        setCreatingContact(false)
        if (error || !contact) {
            toast.error("Error", { description: error ?? "No se pudo crear el contacto" })
            return
        }
        setSelectedContact(contact as Contact)
        toast.success("Contacto creado en Alegra", { description: (contact as Contact).name })
    }

    const onSend = async () => {
        if (!selectedContact) return
        const payload: AlegraSendDecision[] = items
            .filter((it) => it.kind === "unlinked")
            .map((it) => ({ itemId: it.id, action: decisions[it.id] ?? "create" }))

        setSending(true)
        const result = await sendQuoteToAlegra(quoteId, selectedContact.id, payload)
        setSending(false)

        if (result.error) {
            toast.error("Error al crear en Alegra", { description: result.error })
            return
        }
        toast.success(`Cotización creada en Alegra${result.number ? ` (N° ${result.number})` : ""}`, {
            description: "Podés verla y enviarla desde Alegra.",
            action: { label: "Abrir", onClick: () => window.open(result.url, "_blank") },
        })
        onOpenChange(false)
        router.refresh()
    }

    const unlinked = items.filter((it) => it.kind === "unlinked")
    const manual = items.filter((it) => it.kind === "manual")
    const linked = items.filter((it) => it.kind === "linked")

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Crear cotización en Alegra</DialogTitle>
                    <DialogDescription>
                        Se crea el documento en Alegra con estos productos; después la enviás o facturás desde allá.
                    </DialogDescription>
                </DialogHeader>

                {alegraError && (
                    <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">
                        {alegraError}
                    </div>
                )}

                {/* Paso 1: cliente */}
                <div className="space-y-2">
                    <Label>1. Cliente (contacto de Alegra)</Label>
                    {selectedContact ? (
                        <div className="flex items-center justify-between p-3 rounded-md border bg-muted">
                            <span className="flex items-center gap-2 text-sm font-medium">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                {selectedContact.name}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => setSelectedContact(null)}>
                                Cambiar
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    value={contactQuery}
                                    onChange={(e) => onQueryChange(e.target.value)}
                                    placeholder="Buscar contacto en Alegra…"
                                    className="pl-9"
                                />
                            </div>
                            <div className="rounded-md border max-h-40 overflow-auto">
                                {searching && (
                                    <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Buscando en Alegra…
                                    </div>
                                )}
                                {!searching && contacts.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setSelectedContact(c)}
                                        className="w-full text-left p-2.5 hover:bg-muted text-sm"
                                    >
                                        {c.name}
                                    </button>
                                ))}
                                {!searching && contactQuery.trim() && contacts.length === 0 && (
                                    <div className="p-3 text-sm text-muted-foreground">Sin resultados en Alegra</div>
                                )}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onCreateContact}
                                disabled={creatingContact || !contactQuery.trim()}
                            >
                                {creatingContact ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                                Crear &quot;{contactQuery.trim() || "…"}&quot; en Alegra
                            </Button>
                        </>
                    )}
                </div>

                {/* Paso 2: ítems */}
                <div className="space-y-2">
                    <Label>2. Productos</Label>
                    {loadingItems ? (
                        <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Revisando ítems…
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {linked.map((it) => (
                                <div key={it.id} className="flex items-center justify-between p-2.5 rounded-md border text-sm">
                                    <span className="truncate">{it.qty}× {it.label}</span>
                                    <Badge variant="default" className="shrink-0">Ya en Alegra ✓</Badge>
                                </div>
                            ))}
                            {unlinked.map((it) => (
                                <div key={it.id} className="p-2.5 rounded-md border text-sm space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="truncate">{it.qty}× {it.label}</span>
                                        <span className="text-muted-foreground shrink-0">{formatArs(it.unitPrice)}</span>
                                    </div>
                                    <div className="flex gap-3 text-xs">
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input
                                                type="radio"
                                                name={`decision-${it.id}`}
                                                checked={(decisions[it.id] ?? "create") === "create"}
                                                onChange={() => setDecisions((d) => ({ ...d, [it.id]: "create" }))}
                                            />
                                            Crear como producto en Alegra
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input
                                                type="radio"
                                                name={`decision-${it.id}`}
                                                checked={decisions[it.id] === "generic"}
                                                onChange={() => setDecisions((d) => ({ ...d, [it.id]: "generic" }))}
                                            />
                                            Ítem genérico (detalle en descripción)
                                        </label>
                                    </div>
                                </div>
                            ))}
                            {manual.map((it) => (
                                <div key={it.id} className="flex items-center justify-between p-2.5 rounded-md border text-sm">
                                    <span className="truncate">{it.qty}× {it.label}</span>
                                    <Badge variant="secondary" className="shrink-0">Genérico</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Paso 3: confirmar */}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={onSend} disabled={sending || !selectedContact || loadingItems || items.length === 0}>
                        {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                        Crear en Alegra
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
