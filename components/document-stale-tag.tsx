"use client"

// La marca de "desactualizada" en la ficha del pedido, con el detalle adentro.
//
// POR QUÉ UN POPOVER Y NO UN CARTEL: esto vivía arriba de todo, en la columna del
// trabajo, y le ganaba el lugar a lo que el taller necesita leer —qué hay que
// armar—. Que la factura quedó vieja importa, pero no más que el pedido. Acá la
// marca ocupa una palabra al lado del número y el detalle aparece solo si se lo
// pide.
//
// SE ABRE CON CLICK Y NO CON HOVER a propósito: la mitad del taller lo mira desde
// el teléfono, y ahí el hover no existe.

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function DocumentStaleTag({
    label = "desactualizada",
    changes,
}: {
    label?: string
    /** Qué cambió desde que el documento quedó al día, ya redactado. */
    changes: string[]
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="no-print rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 underline decoration-dotted underline-offset-2 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300"
                >
                    {label}
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 text-sm">
                <p className="font-medium mb-2">El pedido cambió después de emitirlo</p>
                {changes.length > 0 ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                        {changes.map((c, i) => (
                            <li key={i} className="flex gap-1.5">
                                <span aria-hidden className="opacity-50">
                                    ·
                                </span>
                                <span className="break-words">{c}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    // El detalle sale del historial: si la tabla de eventos falla o
                    // el cambio es anterior a que se registrara, la advertencia sigue
                    // siendo cierta aunque no se pueda enumerar.
                    <p className="text-xs text-muted-foreground">
                        No se pudo recuperar el detalle de los cambios. Revisá la historia del pedido.
                    </p>
                )}
            </PopoverContent>
        </Popover>
    )
}
