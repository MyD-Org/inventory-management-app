import { describe, expect, it } from "vitest"
import { planReturn, recipeReturnQuantities, type ReturnableMaterial } from "@/lib/returns"

// El caso real: el taller retiró 3 placas por el pedido y al final no van.
const retirado: ReturnableMaterial[] = [
    { material_id: 11, label: "Placa 1 led cálida", consumed: 3 },
    { material_id: 20, label: "Perfil de aluminio", consumed: 2.5 },
]

describe("planReturn", () => {
    it("devuelve lo pedido cuando entra en lo retirado", () => {
        const plan = planReturn(retirado, [{ material_id: 11, quantity: 3 }])
        expect(plan).toEqual({ items: [{ material_id: 11, quantity: 3 }] })
    })

    it("permite devolver una parte", () => {
        const plan = planReturn(retirado, [{ material_id: 11, quantity: 1 }])
        expect(plan).toEqual({ items: [{ material_id: 11, quantity: 1 }] })
    })

    it("ignora las filas vacías o en cero del formulario", () => {
        const plan = planReturn(retirado, [
            { material_id: 11, quantity: 2 },
            { material_id: 20, quantity: 0 },
        ])
        expect(plan).toEqual({ items: [{ material_id: 11, quantity: 2 }] })
    })

    it("rechaza devolver más de lo que el pedido retiró", () => {
        const plan = planReturn(retirado, [{ material_id: 11, quantity: 4 }])
        expect(plan).toEqual({
            error: "Placa 1 led cálida: querés devolver 4 y el pedido retiró 3",
        })
    })

    it("rechaza un material que el pedido nunca retiró", () => {
        const plan = planReturn(retirado, [{ material_id: 99, quantity: 1 }])
        expect(plan).toEqual({ error: "Hay un material que este pedido no retiró" })
    })

    it("suma el mismo material repetido antes de comparar contra el tope", () => {
        // Dos filas de 2 entran de a una, pero juntas son 4 contra 3 retiradas.
        const plan = planReturn(retirado, [
            { material_id: 11, quantity: 2 },
            { material_id: 11, quantity: 2 },
        ])
        expect(plan).toEqual({
            error: "Placa 1 led cálida: querés devolver 4 y el pedido retiró 3",
        })
    })

    it("agrupa el mismo material en una sola entrada de stock", () => {
        const plan = planReturn(retirado, [
            { material_id: 11, quantity: 1 },
            { material_id: 11, quantity: 2 },
        ])
        expect(plan).toEqual({ items: [{ material_id: 11, quantity: 3 }] })
    })

    it("acepta cantidades con decimales, que es como se mide el perfil", () => {
        const plan = planReturn(retirado, [{ material_id: 20, quantity: 2.5 }])
        expect(plan).toEqual({ items: [{ material_id: 20, quantity: 2.5 }] })
    })

    it("junta todos los errores en vez de frenar en el primero", () => {
        const plan = planReturn(retirado, [
            { material_id: 11, quantity: 4 },
            { material_id: 99, quantity: 1 },
        ])
        expect(plan).toEqual({
            error:
                "Placa 1 led cálida: querés devolver 4 y el pedido retiró 3. Hay un material que este pedido no retiró",
        })
    })

    it("sin nada cargado avisa en vez de escribir un movimiento vacío", () => {
        expect(planReturn(retirado, [])).toEqual({ error: "No hay nada para devolver" })
        expect(planReturn(retirado, [{ material_id: 11, quantity: 0 }])).toEqual({
            error: "No hay nada para devolver",
        })
    })

    it("rechaza cantidades negativas o no numéricas en vez de sumar stock al revés", () => {
        expect(planReturn(retirado, [{ material_id: 11, quantity: -2 }])).toEqual({
            error: "No hay nada para devolver",
        })
        expect(planReturn(retirado, [{ material_id: 11, quantity: NaN }])).toEqual({
            error: "No hay nada para devolver",
        })
    })
})

// Una luminaria que lleva 1 placa y 0,5 m de perfil por unidad. El pedido es de 3
// y se retiraron los materiales de las 3.
const receta = [
    { material_id: 11, qty_per_unit: 1 },
    { material_id: 20, qty_per_unit: 0.5 },
]
const retiradoDeLas3: ReturnableMaterial[] = [
    { material_id: 11, label: "Placa 1 led cálida", consumed: 3 },
    { material_id: 20, label: "Perfil de aluminio", consumed: 1.5 },
]

describe("recipeReturnQuantities", () => {
    it("multiplica la receta por las unidades que vuelven", () => {
        const s = recipeReturnQuantities(receta, 2, retiradoDeLas3)
        expect(s.get(11)).toBe(2)
        expect(s.get(20)).toBe(1)
    })

    it("devuelve la receta entera cuando vuelven todas las unidades", () => {
        const s = recipeReturnQuantities(receta, 3, retiradoDeLas3)
        expect(s.get(11)).toBe(3)
        expect(s.get(20)).toBe(1.5)
    })

    it("nunca propone más de lo que el pedido tiene afuera del depósito", () => {
        // Se retiró para una sola unidad, pero vuelven las 3: solo se puede
        // devolver lo que salió.
        const retiradoDeUna: ReturnableMaterial[] = [
            { material_id: 11, label: "Placa 1 led cálida", consumed: 1 },
            { material_id: 20, label: "Perfil de aluminio", consumed: 0.5 },
        ]
        const s = recipeReturnQuantities(receta, 3, retiradoDeUna)
        expect(s.get(11)).toBe(1)
        expect(s.get(20)).toBe(0.5)
    })

    it("omite el material que el pedido nunca retiró", () => {
        const s = recipeReturnQuantities(receta, 2, [
            { material_id: 11, label: "Placa 1 led cálida", consumed: 3 },
        ])
        expect(s.get(11)).toBe(2)
        expect(s.has(20)).toBe(false)
    })

    it("usa la alternativa de la familia si es la que salió del depósito", () => {
        // El BOM resolvió la placa Samsung, pero el depósito retiró la Cree.
        const s = recipeReturnQuantities(
            [{ material_id: 11, qty_per_unit: 1, alternative_ids: [12] }],
            2,
            [{ material_id: 12, label: "Placa 1 led cálida — Cree", consumed: 2 }],
        )
        expect(s.has(11)).toBe(false)
        expect(s.get(12)).toBe(2)
    })

    it("completa con la alternativa cuando el material de la línea no alcanza", () => {
        // Salieron 1 Samsung y 1 Cree para cubrir las 2 unidades.
        const s = recipeReturnQuantities(
            [{ material_id: 11, qty_per_unit: 1, alternative_ids: [12] }],
            2,
            [
                { material_id: 11, label: "Samsung", consumed: 1 },
                { material_id: 12, label: "Cree", consumed: 1 },
            ],
        )
        expect(s.get(11)).toBe(1)
        expect(s.get(12)).toBe(1)
    })

    it("reparte el material que comparten dos líneas sin pasarse del tope", () => {
        // El mismo tornillo en dos líneas de la receta: 2 por unidad en total,
        // pero el pedido solo tiene 3 afuera.
        const s = recipeReturnQuantities(
            [
                { material_id: 50, qty_per_unit: 1 },
                { material_id: 50, qty_per_unit: 1 },
            ],
            2,
            [{ material_id: 50, label: "Tornillo", consumed: 3 }],
        )
        expect(s.get(50)).toBe(3)
    })

    it("ignora las líneas sin material mapeado", () => {
        const s = recipeReturnQuantities(
            [
                { material_id: null, qty_per_unit: 1 },
                { material_id: 11, qty_per_unit: 1 },
            ],
            2,
            retiradoDeLas3,
        )
        expect(s.size).toBe(1)
        expect(s.get(11)).toBe(2)
    })

    it("no sugiere nada con unidades vacías, cero o negativas", () => {
        expect(recipeReturnQuantities(receta, 0, retiradoDeLas3).size).toBe(0)
        expect(recipeReturnQuantities(receta, -1, retiradoDeLas3).size).toBe(0)
        expect(recipeReturnQuantities(receta, NaN, retiradoDeLas3).size).toBe(0)
    })

    it("ignora las líneas con cantidad por unidad en cero", () => {
        // qty 0 en una variante significa "con esta opción la línea no va".
        const s = recipeReturnQuantities([{ material_id: 11, qty_per_unit: 0 }], 2, retiradoDeLas3)
        expect(s.size).toBe(0)
    })

    it("lo sugerido pasa planReturn, que es quien lo va a validar", () => {
        const s = recipeReturnQuantities(receta, 3, retiradoDeLas3)
        const plan = planReturn(
            retiradoDeLas3,
            [...s.entries()].map(([material_id, quantity]) => ({ material_id, quantity })),
        )
        expect(plan).toEqual({
            items: [
                { material_id: 11, quantity: 3 },
                { material_id: 20, quantity: 1.5 },
            ],
        })
    })
})
