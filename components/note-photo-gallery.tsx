"use client"

// Las fotos de una nota: miniaturas en fila y, al tocar una, la foto grande.
//
// Las miniaturas son <img> y no next/image a propósito: son URL del Blob store,
// pasarlas por el optimizador de Next las cobra dos veces (la foto ya se subió
// reducida desde el teléfono) y obliga a declarar el dominio en la config.

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import type { OrderEventPhoto } from "@/lib/order-events"

export function NotePhotoGallery({ photos }: { photos: OrderEventPhoto[] }) {
    // El índice de la foto abierta, o null si no hay ninguna.
    const [abierta, setAbierta] = useState<number | null>(null)

    // Escape cierra y las flechas pasan de foto: con el visor abierto no hay
    // otra cosa en pantalla con la que el teclado pueda estar hablando.
    useEffect(() => {
        if (abierta === null) return
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") setAbierta(null)
            if (e.key === "ArrowRight") setAbierta((i) => (i === null ? null : (i + 1) % photos.length))
            if (e.key === "ArrowLeft") setAbierta((i) => (i === null ? null : (i - 1 + photos.length) % photos.length))
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [abierta, photos.length])

    if (photos.length === 0) return null

    const foto = abierta === null ? null : photos[abierta]

    return (
        <>
            <div className="mt-2.5 flex flex-wrap gap-2">
                {photos.map((f, i) => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setAbierta(i)}
                        aria-label={`Ver foto ${i + 1} de ${photos.length}`}
                        className="overflow-hidden rounded-md border bg-background outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <img
                            src={f.url}
                            alt=""
                            loading="lazy"
                            className="h-20 w-20 object-cover transition-opacity hover:opacity-85 sm:h-24 sm:w-24"
                        />
                    </button>
                ))}
            </div>

            {/* Visor propio y no el Dialog de la app: el Dialog limita el ancho y
                mete padding, y acá lo que se quiere es la foto lo más grande que
                entre en la pantalla. */}
            {foto && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Foto de la nota"
                    onClick={() => setAbierta(null)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
                >
                    <img
                        src={foto.url}
                        alt=""
                        onClick={(e) => e.stopPropagation()}
                        className="max-h-full max-w-full rounded object-contain"
                    />
                    <button
                        type="button"
                        onClick={() => setAbierta(null)}
                        aria-label="Cerrar"
                        className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white outline-none hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    {photos.length > 1 && (
                        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 font-mono text-xs text-white">
                            {abierta! + 1} / {photos.length}
                        </span>
                    )}
                </div>
            )}
        </>
    )
}
