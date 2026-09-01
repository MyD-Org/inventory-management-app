"use client"

// Qué se está emitiendo en Alegra AHORA MISMO, compartido entre el selector de
// estado y las celdas de Factura y Remito.
//
// POR QUÉ HACE FALTA COMPARTIRLO: pasar el pedido a "Facturar y remitir" dispara
// la emisión, pero quien la mira no está mirando el selector —está mirando la
// celda del documento, que es donde va a aparecer el número—. El que dispara y el
// que informa son dos lugares distintos de la misma fila.
//
// ES ESPECÍFICO A PROPÓSITO: se emite solo lo que falta. Si el pedido ya tenía
// factura y le falta el remito, decir "emitiendo factura y remito" es mentira, y
// una mentira que se nota —la factura ya está ahí arriba, con su número—.

import { createContext, useContext, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"

type Doc = "invoice" | "remission"

interface Emision {
    invoice: boolean
    remission: boolean
}

const VACIO: Emision = { invoice: false, remission: false }

const Ctx = createContext<{
    emitiendo: Emision
    setEmitiendo: (e: Emision) => void
}>({ emitiendo: VACIO, setEmitiendo: () => {} })

export function OrderEmissionProvider({ children }: { children: ReactNode }) {
    const [emitiendo, setEmitiendo] = useState<Emision>(VACIO)
    return <Ctx.Provider value={{ emitiendo, setEmitiendo }}>{children}</Ctx.Provider>
}

export function useOrderEmission() {
    return useContext(Ctx)
}

/**
 * Envuelve el contenido de la celda de un documento. Mientras ese documento se
 * está emitiendo muestra el spinner EN LUGAR del contenido: dejar el botón
 * "Emitir factura" visible durante la emisión invita a apretarlo dos veces.
 */
export function EmissionSlot({ doc, children }: { doc: Doc; children: ReactNode }) {
    const { emitiendo } = useOrderEmission()
    if (!emitiendo[doc]) return <>{children}</>
    return (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Emitiendo…
        </span>
    )
}
