import { describe, expect, it } from "vitest"
import { planReturn, type ReturnableMaterial } from "@/lib/returns"

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
