"use client"

// Elegir un producto escribiendo. Sugiere los que ya tienen el costo cargado,
// pero deja escribir uno nuevo: a veces el pedido entra antes. Esa línea queda
// sin lista de materiales hasta que se cargue el costo del producto.

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SellableProduct } from "@/lib/orders"

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
    products: SellableProduct[]
    /** Se elige el NOMBRE: es lo que se guarda en la línea del pedido. */
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
    const menuRef = useRef<HTMLDivElement>(null)
    // La lista se dibuja en el body (portal) y no adentro del campo: en la tabla
    // del pedido el contenedor tiene overflow-x para poder desplazarse en el
    // celular, y eso recorta cualquier hijo absoluto — el desplegable quedaba
    // cortado y con scroll propio adentro de la tabla.
    const [montado, setMontado] = useState(false)
    useEffect(() => setMontado(true), [])

    // Al ser fixed hay que ubicarlo a mano debajo del campo, y volver a hacerlo
    // mientras la página se mueve. Se sigue por frame en vez de escuchar
    // "scroll": el campo puede estar adentro de varios contenedores que se
    // desplazan, y así también acompaña cambios de layout (una fila que se
    // abre, el teclado del celular). Sólo corre con el desplegable abierto, y
    // escribe el estilo directo en el nodo para no re-renderizar por frame.
    useEffect(() => {
        if (!open || !montado) return
        let frame = 0
        const ubicar = () => {
            const campo = boxRef.current
            const menu = menuRef.current
            if (campo && menu) {
                // El mismo picker existe duplicado y oculto con CSS para la
                // otra versión responsive (tabla/tarjetas). El portal no
                // hereda ese "hidden", así que si el campo está oculto (mide
                // 0) hay que esconder también el desplegable: si no, el de la
                // versión invisible queda flotando en la esquina de la
                // pantalla, tapando todo.
                if (campo.offsetParent === null) {
                    menu.style.display = "none"
                    frame = requestAnimationFrame(ubicar)
                    return
                }
                menu.style.display = ""
                const c = campo.getBoundingClientRect()
                const alto = 288 // el tope de la lista
                const abajo = window.innerHeight - c.bottom
                menu.style.left = `${c.left}px`
                menu.style.minWidth = `${c.width}px`
                // Hasta donde quede libre a la derecha, para no salirse.
                menu.style.maxWidth = `${Math.min(544, window.innerWidth * 0.88, window.innerWidth - c.left - 8)}px`
                if (abajo < alto && c.top > abajo) {
                    // No entra abajo y arriba hay más lugar: se abre para arriba.
                    menu.style.top = ""
                    menu.style.bottom = `${window.innerHeight - c.top + 4}px`
                    menu.style.maxHeight = `${Math.min(alto, c.top - 8)}px`
                } else {
                    menu.style.bottom = ""
                    menu.style.top = `${c.bottom + 4}px`
                    menu.style.maxHeight = `${Math.min(alto, abajo - 8)}px`
                }
            }
            frame = requestAnimationFrame(ubicar)
        }
        ubicar()
        return () => cancelAnimationFrame(frame)
    }, [open, montado])

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase()
        // También por código de referencia de Alegra: el taller conoce varios
        // productos por el código antes que por el nombre largo del catálogo.
        const list = q
            ? products.filter(
                  (p) =>
                      p.name.toLowerCase().includes(q) ||
                      (p.reference ?? "").toLowerCase().includes(q),
              )
            : products
        // 15 y no 8: ahora la lista tiene scroll, así que mostrar más no empuja
        // nada fuera de la pantalla. Con 162 productos en el catálogo, ocho
        // dejaban afuera resultados válidos de una búsqueda amplia.
        return list.slice(0, 15)
    }, [products, query])

    // Ofrecemos crearlo salvo que ya exista con ese nombre exacto.
    const nuevo = query.trim()
    const ofrecerNuevo =
        nuevo.length > 0 && !products.some((p) => p.name.toLowerCase() === nuevo.toLowerCase())

    useEffect(() => setCursor(0), [query])

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            const campo = boxRef.current
            // Esta misma instancia puede estar oculta por CSS (es la copia
            // de tabla/tarjeta que no corresponde al ancho actual). Si está
            // oculta, cualquier click real del usuario cae "afuera" de su
            // campo — sin este corte, cancelaba el alta que se estaba
            // haciendo en la OTRA instancia (la visible) antes de que el
            // click llegara a confirmar el producto elegido.
            if (!campo || campo.offsetParent === null) return
            const t = e.target as Node
            // El menú ya no es hijo del campo: hay que preguntarle a los dos.
            if (!campo.contains(t) && !menuRef.current?.contains(t)) {
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
                className={label ? "mt-1.5" : "h-8 text-base"}
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
                        if (matches[cursor]) onPick(matches[cursor].name)
                        else if (ofrecerNuevo) onPick(nuevo)
                    } else if (e.key === "Escape") {
                        e.preventDefault()
                        setOpen(false)
                        onCancel?.()
                    }
                }}
            />

            {open && montado && createPortal(
            // Crece con el contenido en vez de quedar atado al ancho del campo:
            // en la tabla del pedido esa columna es angosta y los nombres del
            // catálogo son largos. minWidth = el ancho del campo para no
            // achicarse, w-max para estirarse hasta donde entre el nombre, y un
            // tope para no irse de la pantalla. max-h + scroll: se listan más
            // opciones sin que el desplegable tape media página.
            <div
                ref={menuRef}
                // Arranca fuera de la pantalla: lo ubica el efecto de arriba,
                // así no se ve un cuadro en la esquina el primer frame.
                style={{ top: -9999 }}
                className="fixed z-50 w-max overflow-y-auto rounded-md border bg-popover shadow-md"
            >
                {matches.map((p, i) => (
                    <button
                        key={p.name}
                        type="button"
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => {
                            setOpen(false)
                            onPick(p.name)
                        }}
                        // truncate: hay productos del catálogo con el detalle
                        // entero en el nombre ("10 metros de tiras de led con
                        // moldura blanca 35cm, segun plano, con 1 fuente 24V…"),
                        // que ocupaban diez renglones y empujaban al resto fuera
                        // de la vista. El nombre completo queda en el title.
                        className={`block w-full truncate px-3 py-1.5 text-left text-base ${
                            i === cursor ? "bg-muted" : ""
                        }`}
                        title={p.reference ? `${p.reference} · ${p.name}` : p.name}
                    >
                        {/* El código adelante y en gris: se puede buscar por él,
                            así que hay que poder verlo y reconocerlo. */}
                        {p.reference && (
                            <span className="text-muted-foreground mr-2">{p.reference}</span>
                        )}
                        {p.name}
                    </button>
                ))}
                {ofrecerNuevo && (
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(false)
                            onPick(nuevo)
                        }}
                        className={`block w-full truncate px-3 py-1.5 text-left text-base ${
                            matches.length > 0 ? "border-t" : ""
                        }`}
                        title={nuevo}
                    >
                        Usar <strong>{nuevo}</strong>
                        <span className="text-muted-foreground"> · producto nuevo</span>
                    </button>
                )}
                {matches.length === 0 && !ofrecerNuevo && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                        Escribí el nombre del producto.
                    </p>
                )}
            </div>,
            document.body,
            )}
        </div>
    )
}
