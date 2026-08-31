// Familias de materiales: tipos y las dos reglas puras que las convierten en una
// línea de hoja de costo.
//
// Vive SEPARADO de lib/material-families.ts —que es 'use server' y habla con la
// base— por el mismo motivo que lib/bom.ts vive separado de lib/orders.ts: acá
// está la regla que decide qué queda cargado en la hoja, y se puede testear sin
// levantar Postgres. El editor de costos, que es un componente de cliente, también
// la importa.

export interface MaterialFamilyOption {
    specValue: string
    materialId: number
    label: string // materials.name, siempre en vivo
    unitCost: number
    barcode: string
    /** Indica cuál material representa al color para costeo y BOM por defecto. */
    isDefault?: boolean
}

export interface MaterialFamily {
    id: number
    name: string
    specFieldKey: string
    // Con qué variante se costea la línea que use esta familia. null = familia
    // incompleta: la UI no la deja usar hasta que se elija una.
    defaultSpecValue: string | null
    options: MaterialFamilyOption[]
}

// Los campos de una línea de hoja de costo que dependen de la familia. El resto
// de la línea (cantidad, uid, isNew) no le incumbe.
export interface FamilyLineFields {
    familyId: number | null
    label: string
    materialId: number | null
    unitCost: number
    specFieldKey: string | null
    options: Array<{ specValue: string; materialId: number | null; label: string }>
}

// Agrupa las opciones de una familia por valor de spec. Un color puede tener
// varios materiales; este helper es el punto único donde se maneja ese agrupamiento.
export function optionsBySpecValue(family: MaterialFamily): Map<string, MaterialFamilyOption[]> {
    const groups = new Map<string, MaterialFamilyOption[]>()
    for (const o of family.options) {
        const list = groups.get(o.specValue) ?? []
        list.push(o)
        groups.set(o.specValue, list)
    }
    return groups
}

// La variante con la que se costea. Si el color tiene varios materiales, usa el
// marcado como default; si no hay marca, cae al primero. Cae a la primera opción
// de la familia si la predeterminada no existe: es mejor costear con algo cargado
// que dejar la línea en cero.
export function defaultOption(family: MaterialFamily): MaterialFamilyOption | undefined {
    const bySpec = optionsBySpecValue(family)
    const candidates = family.defaultSpecValue ? bySpec.get(family.defaultSpecValue) : undefined
    if (candidates && candidates.length > 0) {
        return candidates.find((o) => o.isDefault) ?? candidates[0]
    }
    return family.options[0]
}

// Elegir una familia arma la línea entera: nombre general, campo que la hace
// variar, todas las variantes, y el costo de la predeterminada.
export function lineFromFamily(family: MaterialFamily): FamilyLineFields {
    const def = defaultOption(family)
    return {
        familyId: family.id,
        label: family.name,
        materialId: def?.materialId ?? null,
        unitCost: def?.unitCost ?? 0,
        specFieldKey: family.specFieldKey,
        options: family.options.map((o) => ({ specValue: o.specValue, materialId: o.materialId, label: o.label })),
    }
}

// Pone al día una línea vinculada contra la familia actual. Es lo que hace que el
// vínculo sea VIVO: la hoja muestra y descuenta lo que la familia dice hoy, no la
// foto que guardó cuando se cargó.
//
// El COSTO no se toca. Cambiar el material de una variante no puede mover solo el
// precio de venta de un producto ya calculado; los costos se actualizan cuando
// alguien aprieta "Actualizar precios", como cualquier otra línea.
//
// Si la familia ya no existe, la línea se queda con lo que tenía y pasa a ser una
// línea cargada a mano — igual que hace la base con el ON DELETE SET NULL.
export function syncLineWithFamily<T extends FamilyLineFields>(line: T, family: MaterialFamily | undefined): T {
    if (line.familyId === null) return line
    if (!family) return { ...line, familyId: null }
    const def = defaultOption(family)
    return {
        ...line,
        label: family.name,
        materialId: def?.materialId ?? line.materialId,
        specFieldKey: family.specFieldKey,
        options: family.options.map((o) => ({ specValue: o.specValue, materialId: o.materialId, label: o.label })),
    }
}
