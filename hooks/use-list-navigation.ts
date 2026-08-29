"use client"

// Teclado para los buscadores con lista desplegable: flechas para moverse,
// Enter para elegir, Escape para cerrar. Estaba escrito a mano en el selector de
// productos y faltaba en el resto, así que el mismo campo respondía distinto
// según dónde estuviera. Acá vive una sola vez.
//
// La lista se recorre SIN dar vuelta al llegar a los extremos: en un
// autocompletado el primer resultado es el más probable, y saltar al último
// cuando alguien insiste con la flecha para arriba desorienta.

import { useEffect, useRef, useState, type KeyboardEvent } from "react"

export function useListNavigation({
    count,
    open,
    onSelect,
    onClose,
}: {
    /** Cuántas opciones hay en la lista, contando las que no vienen del servidor
     *  (por ejemplo "usar lo que escribí como cliente nuevo"). */
    count: number
    open: boolean
    /** Qué hacer al apretar Enter sobre la opción marcada. */
    onSelect: (index: number) => void
    onClose?: () => void
}) {
    const [active, setActive] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)

    // Cada búsqueda nueva vuelve a la primera opción: si no, el cursor queda
    // apuntando a la posición 4 de una lista que ahora tiene dos resultados.
    useEffect(() => {
        setActive(0)
    }, [count, open])

    // La opción marcada tiene que verse: la lista scrollea y con la flecha se
    // llega rápido más abajo de lo que entra en pantalla.
    useEffect(() => {
        if (!open) return
        const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
        el?.scrollIntoView({ block: "nearest" })
    }, [active, open])

    function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (!open) return

        if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, count - 1))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
        } else if (e.key === "Enter") {
            // Solo tomamos el Enter si hay algo para elegir. Si la lista está
            // vacía lo dejamos pasar, así el formulario se sigue enviando con
            // Enter como en cualquier otro campo.
            if (count > 0) {
                e.preventDefault()
                onSelect(active)
            }
        } else if (e.key === "Escape") {
            e.preventDefault()
            onClose?.()
        }
    }

    return { active, setActive, listRef, onKeyDown }
}
