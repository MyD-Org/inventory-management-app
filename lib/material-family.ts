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

export type CostStrategy = "average" | "highest" | "specific"

export interface MaterialFamily {
    id: number
    name: string
    specFieldKey: string
    // Con qué variante se costea la línea que use esta familia. null = familia
    // incompleta: la UI no la deja usar hasta que se elija una.
    defaultSpecValue: string | null
    // Cómo se calcula el costo dentro de la variante default.
    costStrategy: CostStrategy
    // Material usado para costear cuando la estrategia es 'specific'.
    costMaterialId: number | null
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

// Costo unitario de la familia según la estrategia elegida.
// - average / highest: se aplican sobre TODOS los materiales de la familia.
// - specific: un material elegido a mano de toda la familia.
//
// Hubo una cuarta, 'default', que costeaba con el material de la variante
// predeterminada. Se quitó en la migración 24: nadie elegía esa variante a
// propósito (es la primera cargada) y si su material no tenía costo, la familia
// entera valía cero sin avisar. `average` es el fallback de las filas viejas.
export function familyUnitCost(family: MaterialFamily): number {
    const options = family.options
    if (!options || options.length === 0) return 0

    switch (family.costStrategy) {
        case "highest":
            return Math.max(...options.map((o) => o.unitCost))
        case "specific": {
            const specific = options.find((o) => o.materialId === family.costMaterialId)
            return specific?.unitCost ?? options[0].unitCost
        }
        case "average":
        default:
            return options.reduce((sum, o) => sum + o.unitCost, 0) / options.length
    }
}

// Elegir una familia arma la línea entera: nombre general, campo que la hace
// variar, todas las variantes, y el costo calculado por la estrategia.

// Las variantes tal como las guarda una línea de hoja de costo: UNA por valor de
// spec. La familia puede tener varios materiales para el mismo color (alternativas
// del inventario), pero la línea guarda la foto del elegido —
// budget_material_options tiene UNIQUE (budget_material_id, spec_value) — y ademas
// validBudgetPayload rechaza el duplicado antes de llegar a la base.
//
// El elegido es el marcado con isDefault, que es exactamente para lo que existe esa
// marca. Sin este colapso, cualquier hoja que use una familia con dos materiales en
// un color no se puede guardar: "La variante X está repetida".
export function familyLineOptions(family: MaterialFamily): FamilyLineFields["options"] {
    return Array.from(optionsBySpecValue(family).values()).map((options) => {
        const chosen = options.find((o) => o.isDefault) ?? options[0]
        return { specValue: chosen.specValue, materialId: chosen.materialId, label: chosen.label }
    })
}

export function lineFromFamily(family: MaterialFamily): FamilyLineFields {
    const def = defaultOption(family)
    return {
        familyId: family.id,
        label: family.name,
        materialId: def?.materialId ?? null,
        unitCost: familyUnitCost(family),
        specFieldKey: family.specFieldKey,
        options: familyLineOptions(family),
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
        options: familyLineOptions(family),
    }
}

// Cómo se calcula el costo de la familia, en una frase. Se muestra donde antes se
// decía "con esta se calcula el costo" sobre la variante predeterminada: eso dejó de
// ser cierto cuando se quitó la estrategia 'default' (migración 24), porque el costo
// ya no sale de una variante sino de todos los materiales.
export function costStrategySummary(family: MaterialFamily): string {
    switch (family.costStrategy) {
        case "highest":
            return "el costo sale del material más caro"
        case "specific": {
            const chosen = family.options.find((o) => o.materialId === family.costMaterialId)
            return chosen ? `el costo sale de ${chosen.label}` : "el costo sale de un material elegido"
        }
        case "average":
        default:
            return `el costo es el promedio de los ${family.options.length} materiales`
    }
}

// Variantes que ya tiene una familia, en la forma en que se guardan.
export interface StoredOption {
    specValue: string
    materialId: number
    isDefault: boolean
}

// Suma variantes nuevas a las que la familia ya tiene, SIN tocar las existentes.
//
// Es la regla que hace segura la tool add_family_options del asistente: guardar una
// familia reemplaza todas sus variantes (insertMaterialFamily hace delete + insert),
// así que si el agente mandara la lista entera podría borrar la carga previa por
// omisión. Mandando solo lo nuevo y mergeando acá, lo peor que puede pasar es que no
// agregue nada.
//
// Reglas:
// - Un (specValue, materialId) que ya existe se ignora: la operación es idempotente
//   y repetir un pedido no duplica ni pisa.
// - En una variante NUEVA, el primer material entra como default: cada variante
//   necesita exactamente uno y no hay a quién preguntarle.
// - En una variante que YA existe, lo nuevo entra como NO default: cambiar con qué
//   material costea una variante ya cargada es una decisión, no un efecto secundario
//   de agregar.
export function mergeFamilyOptions(
    existing: StoredOption[],
    incoming: Array<{ specValue: string; materialId: number }>,
): { options: StoredOption[]; added: StoredOption[]; skipped: Array<{ specValue: string; materialId: number }> } {
    const options = [...existing]
    const added: StoredOption[] = []
    const skipped: Array<{ specValue: string; materialId: number }> = []

    for (const candidate of incoming) {
        const specValue = candidate.specValue.trim()
        const duplicate = options.some(
            (o) => o.specValue.trim().toLowerCase() === specValue.toLowerCase() && o.materialId === candidate.materialId,
        )
        if (duplicate) {
            skipped.push({ specValue, materialId: candidate.materialId })
            continue
        }
        const specExists = options.some((o) => o.specValue.trim().toLowerCase() === specValue.toLowerCase())
        const option: StoredOption = {
            specValue,
            materialId: candidate.materialId,
            isDefault: !specExists,
        }
        options.push(option)
        added.push(option)
    }

    return { options, added, skipped }
}
