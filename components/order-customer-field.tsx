"use client"

// Campo Cliente editable en el detalle del pedido. Busca contra Alegra y permite
// escribir libre si el cliente no está.

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { CustomerAutocomplete } from "@/components/customer-autocomplete"
import { updateOrderFields } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"

function parseAlegraId(externalId: string | null): number | null {
    if (!externalId) return null
    const match = externalId.match(/^alegra:(\d+)$/)
    return match ? Number(match[1]) : null
}

function manualExternalId(name: string): string | null {
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '')
    return slug ? `manual:${slug}` : null
}

export function OrderCustomerField({
    orderId,
    customerName,
    customerExternalId,
}: {
    orderId: number
    customerName: string | null
    customerExternalId: string | null
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [name, setName] = useState(customerName ?? "")
    const [contactId, setContactId] = useState<number | null>(parseAlegraId(customerExternalId))
    // Evita que el onChange que dispara CustomerAutocomplete tras seleccionar un
    // contacto guarde el nombre como cliente manual y pise el alegra:<id>.
    const justSelectedRef = useRef(false)

    const save = useDebouncedCallback(async (nextName: string, nextExternalId: string | null) => {
        const result = await updateOrderFields(orderId, {
            customer_name: nextName.trim() || null,
            customer_external_id: nextExternalId,
        })

        if (result.error) {
            toast.error("No se pudo guardar el cliente", { description: result.error })
            return
        }

        router.refresh()
    }, 500)

    function handleChange(nextName: string) {
        setName(nextName)
        // Texto libre: desvinculamos de Alegra y generamos un id manual,
        // porque la columna customer_external_id es NOT NULL.
        setContactId(null)
        // CustomerAutocomplete dispara onChange con el nombre del contacto
        // inmediatamente después de onSelect; lo ignoramos para no pisar el
        // alegra:<id> que acabamos de guardar.
        if (justSelectedRef.current) {
            justSelectedRef.current = false
            return
        }
        const nextExternalId = manualExternalId(nextName)
        if (nextExternalId) save(nextName, nextExternalId)
    }

    function handleSelect(contact: { id: number; name: string } | null) {
        if (!contact) return
        // Cancelamos cualquier guardado de texto libre pendiente para que no
        // pise la selección de un contacto de Alegra.
        save.cancel?.()
        justSelectedRef.current = true
        setName(contact.name)
        setContactId(contact.id)
        save(contact.name, `alegra:${contact.id}`)
    }

    return (
        <CustomerAutocomplete
            value={name}
            contactId={contactId}
            onChange={handleChange}
            onSelect={handleSelect}
            enabled
            emptyMessage="No encontramos ese contacto en Alegra. Si el cliente no existe, se creará al emitir la factura."
        />
    )
}
