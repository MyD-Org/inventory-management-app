// Devolución de material retirado por un pedido: la regla de cuánto se puede
// devolver, sin base de datos.
//
// Vive separado de lib/order-actions.ts —que es 'use server' y habla con Postgres—
// por el mismo motivo que lib/material-family.ts vive separado de
// lib/material-families.ts: acá está la regla, y se puede testear sin levantar
// nada.
//
// LA REGLA, en una línea: el tope es lo que ESTE pedido tiene afuera del depósito
// (salidas menos devoluciones anteriores), y no el stock ni lo que pedía la receta.
// Devolver más que eso sería dar de alta material que vino de otro lado, y eso es
// un ajuste de inventario, no una devolución.

export interface ReturnableMaterial {
    material_id: number
    label: string
    /** Neto retirado por el pedido: salidas menos lo ya devuelto. */
    consumed: number
}

export interface ReturnRequestItem {
    material_id: number
    quantity: number
}

/**
 * Qué se va a devolver de verdad, o por qué no se puede.
 *
 * Se valida TODO antes de devolver la primera línea: media devolución aplicada
 * deja el inventario peor que no haber hecho nada, y es el mismo criterio que ya
 * usa el descuento de materiales.
 */
export function planReturn(
    returnable: ReturnableMaterial[],
    items: ReturnRequestItem[],
): { items: ReturnRequestItem[] } | { error: string } {
    // Las filas en cero o vacías no son un error: el formulario manda todas las
    // líneas y quien devuelve completa solo las que trae en la mano.
    const pedido = items.filter((i) => Number.isFinite(i.quantity) && i.quantity > 0)
    if (pedido.length === 0) return { error: "No hay nada para devolver" }

    const porMaterial = new Map(returnable.map((r) => [r.material_id, r]))

    // Un material repetido en el pedido se suma antes de comparar contra el tope:
    // dos filas de 2 contra 3 retiradas son 4, aunque cada una sola entre.
    const totalPorMaterial = new Map<number, number>()
    for (const item of pedido) {
        totalPorMaterial.set(item.material_id, (totalPorMaterial.get(item.material_id) ?? 0) + item.quantity)
    }

    const errores: string[] = []
    for (const [materialId, total] of totalPorMaterial) {
        const disponible = porMaterial.get(materialId)
        if (!disponible) {
            errores.push("Hay un material que este pedido no retiró")
        } else if (total > disponible.consumed) {
            errores.push(
                `${disponible.label}: querés devolver ${total} y el pedido retiró ${disponible.consumed}`,
            )
        }
    }
    if (errores.length > 0) return { error: errores.join(". ") }

    // Se devuelven ya sumadas: una sola entrada de stock por material, para que el
    // historial del inventario no muestre dos renglones de la misma devolución.
    return {
        items: [...totalPorMaterial.entries()].map(([material_id, quantity]) => ({ material_id, quantity })),
    }
}
