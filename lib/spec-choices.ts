import { getSpecs } from "@/lib/orders"

// Un campo del vocabulario de specs que puede hacer variar una línea de receta.
// Vive acá y no en el editor: budget-editor.tsx es "use client", y que un módulo
// de servidor lo importe —aunque sea solo el tipo— mete un componente de cliente
// en el grafo del servidor.
export interface SpecFieldChoice {
    key: string
    label: string
    options: Array<{ value: string; label: string }>
}

// Vocabulario de specs en la forma que necesita el editor de costos para las
// variantes de una línea. Deriva de getSpecs() —la misma fuente que ve el bot en
// GET /api/specs— para que lo que se puede mapear en la hoja de costo sea
// exactamente lo que un pedido puede pedir.
//
// Solo campos de LISTA: variar por un texto libre ('other') no tiene sentido, y
// los boolean ('stake', con/sin estaca) son un agregado o no de la receta, no una
// sustitución de material.
export async function listSpecChoices(): Promise<SpecFieldChoice[]> {
    const specs = await getSpecs()
    return Object.entries(specs)
        .filter(([, f]) => f.kind === "list" && f.options.length > 0)
        .map(([key, f]) => ({
            key,
            label: f.label,
            options: f.options.map((value) => ({ value, label: f.labels[value] ?? value })),
        }))
}
