"use client"

// Materiales del pedido: sección desplegable con el estado de stock al lado de
// cada uno, en vez de una lista muda arriba y un cartel de faltantes abajo.
// Desde acá se descuentan del inventario, con las cantidades sugeridas y
// editables.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChevronRight, PackageMinus, PackagePlus } from "lucide-react"
import { ConsumeMaterialsForm } from "@/components/consume-materials-form"
import { ReturnMaterialsForm } from "@/components/return-materials-form"
import { useToast } from "@/hooks/use-toast"
import type { ConsumedMaterial, ExtraConsumed, MaterialNeed, OrderItemRecipe } from "@/lib/orders"
import { formatStock } from "@/lib/format"

// Dos datos distintos, dos columnas: cuánto hay en el depósito (Stock) y en qué
// anda ese material dentro del pedido (Estado). Antes la misma celda mostraba a
// veces un número y a veces la palabra "descontado", así que no se podía leer
// ninguna de las dos cosas de un vistazo.
function Stock({ available, falta = false }: { available: number | null; falta?: boolean }) {
    if (available === null) {
        return <span className="font-mono text-sm text-muted-foreground">—</span>
    }
    // El número en rojo cuando no alcanza: el ojo va a la cifra antes que a la
    // palabra de la columna Estado.
    return (
        <span
            className={`font-mono text-sm tabular-nums ${falta ? "font-medium text-destructive" : "text-muted-foreground"}`}
        >
            {formatStock(available)}
        </span>
    )
}

function Estado({ n }: { n: MaterialNeed }) {
    if (n.available === null) {
        return <span className="text-sm text-muted-foreground">fuera del inventario</span>
    }
    if (n.pending === 0) {
        return <span className="text-sm text-emerald-600">descontado</span>
    }
    if (n.available < n.pending) {
        return <span className="text-sm font-medium text-destructive">stock insuficiente</span>
    }
    if (n.consumed > 0) {
        return <span className="text-sm text-muted-foreground">descontado en parte</span>
    }
    return <span className="text-sm text-muted-foreground">a descontar</span>
}

export function OrderMaterials({
    orderId,
    needs,
    extras = [],
    consumed = [],
    recipes = [],
    canConsume = true,
}: {
    orderId: number
    needs: MaterialNeed[]
    /** Lo retirado por este pedido que no estaba en la lista de materiales. */
    extras?: ExtraConsumed[]
    /**
     * Lo que hoy está afuera del depósito por este pedido, material por material.
     * Es lo que se puede devolver: sale de los movimientos, no del BOM.
     */
    consumed?: ConsumedMaterial[]
    /** Receta por unidad de cada producto, para devolver "2 de las 3 luminarias". */
    recipes?: OrderItemRecipe[]
    /**
     * Si puede descontar del inventario. En false la sección queda de lectura:
     * la lista y el stock se siguen viendo (hay que saber si el material está
     * para armar el pedido), pero no hay puerta para retirarlo. Es el rol
     * "Solo pedidos". El server lo vuelve a verificar en consumeOrderMaterials.
     */
    canConsume?: boolean
}) {
    const router = useRouter()
    const { toast } = useToast()
    // Cerrado por defecto: el detalle ya es largo y esta lista se abre cuando se
    // va a buscar al depósito, no cada vez que se mira el pedido.
    const [abierto, setAbierto] = useState(false)
    const [dialogo, setDialogo] = useState(false)
    const [devolucion, setDevolucion] = useState(false)

    const descontables = needs.filter((n) => n.material_id !== null && n.pending > 0)
    const conFaltante = needs.filter((n) => n.available !== null && n.pending > n.available)
    const todoDescontado = needs.length > 0 && needs.every((n) => n.pending === 0)

    // Sin lista de materiales la sección igual se muestra: es la única puerta
    // para retirar algo por este pedido (un pedido sin hoja de costo, o un
    // material que se rompió después de haber descontado todo).

    return (
        // no-print: al imprimir sale la orden de trabajo (qué armar), no la
        // lista de materiales. Esa es para buscar al depósito, en pantalla.
        <section className="no-print">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-2">
                <button
                    type="button"
                    onClick={() => setAbierto((v) => !v)}
                    className="flex items-center gap-1.5 text-base font-medium text-muted-foreground hover:text-foreground"
                >
                    <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-90" : ""}`}
                    />
                    <span className="font-display text-base font-semibold text-foreground">
                        Materiales a utilizar
                    </span>
                    <span className="font-mono text-xs text-muted-foreground/80">
                        ({needs.length + extras.length})
                    </span>
                </button>

                {conFaltante.length > 0 && (
                    <span className="text-sm font-medium text-destructive">
                        {conFaltante.length === 1
                            ? "1 material faltante"
                            : `${conFaltante.length} materiales faltantes`}
                    </span>
                )}

                {/* El botón queda SIEMPRE: aunque la lista esté toda descontada, el
                    taller sigue necesitando retirar el tornillo que se rompió o el
                    metro de más, y tiene que salir por el pedido para quedar
                    vinculado a él. Antes, con todo descontado, no había puerta. */}
                <div className="ml-auto no-print flex items-center gap-2">
                    {todoDescontado && (
                        <span className="text-sm text-emerald-600">Ya descontado del inventario</span>
                    )}
                    {canConsume && (
                        <Button variant="outline" size="sm" onClick={() => setDialogo(true)}>
                            <PackageMinus className="mr-1.5 h-3.5 w-3.5" />
                            {descontables.length === 0 ? "Retirar más materiales" : "Descontar del inventario"}
                        </Button>
                    )}
                    {/* Solo si hay algo afuera del depósito por este pedido: sin retiro
                        no hay nada que devolver y el botón sería una puerta a una
                        lista vacía. */}
                    {canConsume && consumed.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setDevolucion(true)}>
                            <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
                            Devolver al inventario
                        </Button>
                    )}
                </div>
            </div>

            {abierto && (
                <div className="border rounded-lg divide-y overflow-hidden">
                    {/* Cantidad contra stock: las dos cifras alineadas a la derecha se
                        comparan de un vistazo, que es la pregunta real del depósito.
                        El estado va aparte, en palabras. */}
                    <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] sm:grid-cols-[minmax(0,1fr)_5rem_5rem_9rem] gap-2 sm:gap-3 bg-muted/60 px-3 sm:px-4 py-2 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                        <span>Material</span>
                        {/* "Cantidad" y no "Necesita": la misma columna lleva lo que
                            pide el BOM y lo que se retiró de más, que nadie pidió. */}
                        <span className="text-right">Cantidad</span>
                        <span className="text-right">En stock</span>
                        <span className="hidden sm:block text-right">Estado</span>
                    </div>
                    {needs.map((n) => {
                        const needKey =
                            n.family_id !== null
                                ? `fam:${n.family_id}:${n.spec_value}`
                                : `mat:${n.material_id ?? n.label}`
                        return (
                        <div
                            key={needKey}
                            className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] sm:grid-cols-[minmax(0,1fr)_5rem_5rem_9rem] items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5"
                        >
                            <span className="min-w-0 truncate">
                                {n.label}
                                {n.alternatives.length > 1 && (
                                    <span className="block text-xs text-muted-foreground">
                                        {n.alternatives.length} opciones
                                    </span>
                                )}
                                {n.consumed > 0 && n.pending > 0 && (
                                    <span className="block text-xs text-muted-foreground">
                                        {formatStock(n.consumed)} ya descontados
                                    </span>
                                )}
                                <span className="block sm:hidden">
                                    <Estado n={n} />
                                </span>
                            </span>
                            <span className="text-right font-mono text-sm tabular-nums">{formatStock(n.required)}</span>
                            <span className="text-right">
                                <Stock available={n.available} falta={n.available !== null && n.available < n.pending} />
                            </span>
                            <span className="hidden sm:block text-right">
                                <Estado n={n} />
                            </span>
                        </div>
                        )
                    })}

                    {extras.map((e) => (
                        <div
                            key={`extra:${e.material_id}`}
                            className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] sm:grid-cols-[minmax(0,1fr)_5rem_5rem_9rem] items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5"
                        >
                            <span className="min-w-0 truncate">
                                {e.label}
                                <span className="block text-xs text-muted-foreground">
                                    extra, fuera de la lista
                                </span>
                                <span className="block sm:hidden text-sm text-emerald-600">retirado</span>
                            </span>
                            <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                                {formatStock(e.quantity)}
                            </span>
                            <span className="text-right">
                                <Stock available={e.available} />
                            </span>
                            <span className="hidden sm:block text-right text-sm text-emerald-600">retirado</span>
                        </div>
                    ))}
                </div>
            )}

            {canConsume && (
            <Dialog open={dialogo} onOpenChange={setDialogo}>
                <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Descontar del inventario</DialogTitle>
                    </DialogHeader>

                    <p className="text-base text-muted-foreground -mt-2">
                        Se registra como una salida de stock por este pedido. Podés agregar
                        materiales que no estén en la lista.
                    </p>

                    <ConsumeMaterialsForm
                        orderId={orderId}
                        needs={needs}
                        onCancel={() => setDialogo(false)}
                        onDone={() => {
                            setDialogo(false)
                            router.refresh()
                        }}
                    />
                </DialogContent>
            </Dialog>
            )}

            {canConsume && (
            <Dialog open={devolucion} onOpenChange={setDevolucion}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Devolver al inventario</DialogTitle>
                    </DialogHeader>

                    <p className="-mt-2 text-base text-muted-foreground">
                        Material que se retiró por este pedido y vuelve al depósito. Se registra
                        como una entrada de stock; el retiro original queda en el historial.
                    </p>

                    <ReturnMaterialsForm
                        orderId={orderId}
                        consumed={consumed}
                        recipes={recipes}
                        onCancel={() => setDevolucion(false)}
                        onDone={() => {
                            setDevolucion(false)
                            router.refresh()
                        }}
                    />
                </DialogContent>
            </Dialog>
            )}
        </section>
    )
}
