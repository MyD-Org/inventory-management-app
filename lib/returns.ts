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

// ---------- Devolver la receta de un producto ----------

/** Una línea de la receta de un producto del pedido, tal como se explotó el BOM. */
export interface RecipeLine {
    /** El material que la línea resolvió al explotar el BOM. null = sin mapear. */
    material_id: number | null
    /** Cuánto lleva UNA unidad del producto. */
    qty_per_unit: number
    /**
     * Otros materiales que pueden haber salido en lugar del de arriba: las
     * alternativas de la familia para ese color. El depósito elige cuál retira,
     * así que devolver tiene que mirarlas todas.
     */
    alternative_ids?: number[]
}

/**
 * Cuánto devolver de cada material si vuelven `units` unidades de un producto.
 *
 * Es una SUGERENCIA para llenar el formulario, no una orden: quien devuelve la
 * corrige antes de confirmar (una placa se rompió al desarmar y no vuelve, media
 * bobina ya se cortó). Por eso nunca propone más de lo que el pedido tiene afuera
 * del depósito: sugerir algo que el server va a rechazar es hacerle perder el
 * viaje a quien carga.
 *
 * Dos cosas que no son obvias:
 *
 * - Un material que aparece en varias líneas —el mismo tornillo en dos productos—
 *   se reparte: lo que se lleva la primera línea deja de estar disponible para la
 *   siguiente, así la suma nunca pasa el tope.
 * - Si el material de la línea no figura entre lo retirado pero sí una alternativa
 *   de su familia, se propone la alternativa: es el mismo color resuelto con otro
 *   material, que es exactamente lo que salió del depósito.
 */
export function recipeReturnQuantities(
    lines: RecipeLine[],
    units: number,
    returnable: ReturnableMaterial[],
): Map<number, number> {
    const sugerido = new Map<number, number>()
    if (!Number.isFinite(units) || units <= 0) return sugerido

    // Lo que queda por repartir de cada material, a medida que las líneas lo toman.
    const disponible = new Map(returnable.map((r) => [r.material_id, r.consumed]))

    for (const line of lines) {
        let falta = line.qty_per_unit * units
        if (!Number.isFinite(falta) || falta <= 0) continue

        // El material de la línea primero: es el que el BOM eligió. Las
        // alternativas solo entran si con aquel no alcanza.
        const candidatos = [line.material_id, ...(line.alternative_ids ?? [])].filter(
            (id): id is number => id !== null,
        )

        for (const materialId of candidatos) {
            if (falta <= 0) break
            const queda = disponible.get(materialId) ?? 0
            if (queda <= 0) continue
            const toma = Math.min(falta, queda)
            sugerido.set(materialId, (sugerido.get(materialId) ?? 0) + toma)
            disponible.set(materialId, queda - toma)
            falta -= toma
        }
        // Si sobra `falta` no se fuerza nada: el pedido no tiene ese material
        // afuera del depósito, así que no hay qué devolver.
    }

    return sugerido
}

// ---------- Devolver por producto ----------

/** Un producto del pedido con su receta por unidad. */
export interface ProductRecipe {
    order_item_id: number
    product: string
    /** Unidades pedidas del producto. */
    quantity: number
    lines: RecipeLine[]
}

export interface WithdrawnProduct {
    order_item_id: number
    product: string
    /** Cuántas unidades del producto están hoy afuera del depósito. */
    units: number
}

// De cuántas unidades de cada producto se retiró el material.
//
// El retiro se registra por MATERIAL, no por producto, así que las unidades se
// deducen de la receta: si una unidad lleva 1 placa y 4 tornillos, y hay 2 placas
// y 12 tornillos afuera, se retiró para 2 unidades —manda el material que menos
// alcanza—. Se topea en lo pedido: retirar de más no crea unidades que el pedido
// no tiene.
//
// Un producto sin nada retirado no entra en la lista: no hay retiro que cancelar.
export function withdrawnProducts(
    recipes: ProductRecipe[],
    returnable: ReturnableMaterial[],
): WithdrawnProduct[] {
    const afuera = new Map(returnable.map((r) => [r.material_id, r.consumed]))

    const productos: WithdrawnProduct[] = []
    for (const recipe of recipes) {
        // Solo las líneas que consumen algo y tienen material: una línea sin
        // mapear no dice nada de cuántas unidades salieron.
        const lineas = recipe.lines.filter((l) => l.qty_per_unit > 0 && l.material_id !== null)
        if (lineas.length === 0) continue

        let unidades = recipe.quantity
        for (const linea of lineas) {
            // El material de la línea más sus alternativas: el depósito pudo haber
            // retirado cualquiera de las del mismo color.
            const disponible = [linea.material_id, ...(linea.alternative_ids ?? [])]
                .filter((id): id is number => id !== null)
                .reduce((sum, id) => sum + (afuera.get(id) ?? 0), 0)
            unidades = Math.min(unidades, Math.floor(disponible / linea.qty_per_unit))
            if (unidades <= 0) break
        }

        if (unidades > 0) {
            productos.push({ order_item_id: recipe.order_item_id, product: recipe.product, units: unidades })
        }
    }

    return productos
}

/**
 * Qué materiales devolver si vuelven ciertas unidades de ciertos productos.
 *
 * Los productos comparten el mismo pozo de material retirado: si dos llevan el
 * mismo tornillo, lo que se lleva el primero deja de estar para el segundo. Por eso
 * se resuelven juntos y no uno por uno, que es lo que haría que la suma se pasara
 * del tope y el server rechazara la devolución entera.
 */
export function planProductReturn(
    recipes: ProductRecipe[],
    selections: Array<{ order_item_id: number; units: number }>,
    returnable: ReturnableMaterial[],
): ReturnRequestItem[] {
    const pozo = new Map(returnable.map((r) => [r.material_id, r.consumed]))
    const total = new Map<number, number>()

    for (const seleccion of selections) {
        if (!Number.isFinite(seleccion.units) || seleccion.units <= 0) continue
        const recipe = recipes.find((r) => r.order_item_id === seleccion.order_item_id)
        if (!recipe) continue

        const restante: ReturnableMaterial[] = [...pozo.entries()].map(([material_id, consumed]) => ({
            material_id,
            label: "",
            consumed,
        }))
        for (const [materialId, cantidad] of recipeReturnQuantities(recipe.lines, seleccion.units, restante)) {
            total.set(materialId, (total.get(materialId) ?? 0) + cantidad)
            pozo.set(materialId, (pozo.get(materialId) ?? 0) - cantidad)
        }
    }

    return [...total.entries()]
        .filter(([, quantity]) => quantity > 0)
        .map(([material_id, quantity]) => ({ material_id, quantity }))
}
