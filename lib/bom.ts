// Resolución del BOM: qué material sale realmente del depósito para una línea de
// receta, dadas las specs de lo que pidió el cliente.
//
// Vive SEPARADO de lib/orders.ts, igual que lib/order-validation.ts y
// lib/order-statuses.ts: acá no se importa la base, así que la regla —que decide
// qué se descuenta del stock— se puede testear sin levantar Postgres, y tampoco
// arrastra lib/database.ts a donde no corresponde.

export interface BomOption {
    specValue: string
    materialId: number | null
    label: string
    /** Cuando un color tiene varios materiales, indica cuál se usa por defecto. */
    isDefault?: boolean
}

export interface BomLine {
    id: number
    // Familia de materiales a la que pertenece la línea. null = mapeo propio.
    familyId?: number | null
    // Material de REFERENCIA: el que define el costo de la línea en la hoja y el
    // que se usa cuando la variante no aplica o no está mapeada.
    materialId: number | null
    label: string
    qty: number
    // Campo del vocabulario de specs que hace variar esta línea (led_color,
    // clamp, ...). null = material fijo.
    specFieldKey: string | null
    options: BomOption[]
}

export interface ResolvedBomLine {
    materialId: number | null
    label: string
    qty: number
    // true = se usó una variante en lugar del material de referencia.
    substituted: boolean
    // El pedido pidió un valor que la hoja de costo no tiene mapeado. Se cae al
    // material de referencia (que puede ser el equivocado), así que la línea del
    // pedido queda marcada para revisión en vez de descontar en silencio.
    unmapped: string | null
    // Origen de la alternativa, para reconstruir las opciones al consumir stock.
    familyId?: number | null
    specValue?: string | null
}

// Devuelve el material real de una línea. El orden de las reglas importa:
// sin campo de variación, o sin valor en las specs, se comporta igual que antes
// de que existieran las variantes.
export function resolveBomLine(line: BomLine, specs: Record<string, unknown>): ResolvedBomLine {
    const base = { materialId: line.materialId, label: line.label, qty: line.qty }

    if (!line.specFieldKey) return { ...base, substituted: false, unmapped: null }

    const raw = specs?.[line.specFieldKey]
    if (raw === "" || raw === null || raw === undefined) {
        return { ...base, substituted: false, unmapped: null }
    }

    const value = String(raw)
    const matches = line.options.filter((o) => o.specValue === value)
    if (matches.length === 0) {
        return { ...base, substituted: false, unmapped: `${line.specFieldKey}=${value}` }
    }

    // Si un color tiene varios materiales, usa el marcado como default; si no hay
    // marca, cae al primero para no romper el contrato anterior.
    const match = matches.find((o) => o.isDefault) ?? matches[0]

    return {
        materialId: match.materialId,
        label: match.label,
        qty: line.qty,
        substituted: true,
        unmapped: null,
        familyId: line.familyId ?? null,
        specValue: value,
    }
}

// ¿Cambiaron las specs de una línea? Decide si hay que re-explotar el BOM al
// editar un pedido. Compara por contenido, no por texto: las specs guardadas
// vuelven de un JSONB (Postgres normaliza el orden de las claves) y las nuevas
// llegan del formulario, así que un JSON.stringify de cada lado daría distinto
// aunque digan lo mismo — y re-explotar de gusto puede pisar un BOM que el
// taller ya ajustó a mano.
export function sameSpecs(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    // Un campo vacío y un campo ausente son lo mismo: "sin especificar".
    const clean = (o: Record<string, unknown>) =>
        Object.entries(o ?? {})
            .filter(([, v]) => v !== "" && v !== null && v !== undefined)
            .map(([k, v]) => [k, String(v)] as const)
            .sort(([x], [y]) => x.localeCompare(y))

    const ca = clean(a)
    const cb = clean(b)
    if (ca.length !== cb.length) return false
    return ca.every(([k, v], i) => cb[i][0] === k && cb[i][1] === v)
}

// Explota la receta completa de un producto para una cantidad dada.
// qtyTotal se calcula acá para que la regla de multiplicación quede junto con la
// de sustitución y se testee igual de fácil.
export function resolveBom(
    lines: BomLine[],
    specs: Record<string, unknown>,
    quantity: number,
): { lines: Array<ResolvedBomLine & { qtyTotal: number }>; unmapped: string[] } {
    const resolved = lines.map((l) => {
        const r = resolveBomLine(l, specs)
        return { ...r, qtyTotal: r.qty * quantity }
    })
    // Sin repetidos: si tres líneas varían por led_color y el color no está
    // mapeado en ninguna, al taller le alcanza con que se lo digan una vez.
    const unmapped = [...new Set(resolved.map((r) => r.unmapped).filter((u): u is string => u !== null))]
    return { lines: resolved, unmapped }
}
