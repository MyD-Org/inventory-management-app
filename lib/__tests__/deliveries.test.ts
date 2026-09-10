import { describe, expect, it } from "vitest"
import {
    DELIVERY_LABELS,
    deliveredOverflow,
    deliveryState,
    describeDelivery,
    describePendingDelivery,
    pendingQuantity,
    planDelivery,
    type DeliverableItem,
} from "@/lib/deliveries"

// El caso real: 10 luminarias pedidas, 4 remitidas en el primer remito, y una
// segunda línea que todavía no salió.
const pedido: DeliverableItem[] = [
    { id: 1, product: "Optic 9 12-24v", quantity: 10, delivered: 4 },
    { id: 2, product: "Estaca corta", quantity: 3, delivered: 0 },
]

describe("pendingQuantity", () => {
    it("resta lo ya remitido", () => {
        expect(pendingQuantity(pedido[0])).toBe(6)
        expect(pendingQuantity(pedido[1])).toBe(3)
    })

    it("nunca es negativo, aunque se haya remitido de más", () => {
        expect(pendingQuantity({ id: 1, product: "X", quantity: 3, delivered: 5 })).toBe(0)
    })
})

describe("deliveryState", () => {
    it("sin remitir cuando no salió nada", () => {
        expect(deliveryState([{ id: 1, product: "X", quantity: 5, delivered: 0 }])).toBe("sin_remitir")
    })

    it("parcial cuando salió una parte", () => {
        expect(deliveryState(pedido)).toBe("parcial")
    })

    it("remitido cuando salió todo", () => {
        expect(
            deliveryState([
                { id: 1, product: "X", quantity: 10, delivered: 10 },
                { id: 2, product: "Y", quantity: 3, delivered: 3 },
            ]),
        ).toBe("remitido")
    })

    it("un pedido sin líneas no está remitido", () => {
        expect(deliveryState([])).toBe("sin_remitir")
    })

    it("no se cuelga de un redondeo de centésimas", () => {
        expect(deliveryState([{ id: 1, product: "X", quantity: 3, delivered: 2.999 }])).toBe("remitido")
    })

    it("tiene etiqueta para cada estado", () => {
        expect(DELIVERY_LABELS[deliveryState(pedido)]).toBe("Remitido en parte")
    })
})

describe("describeDelivery", () => {
    it("dice cuánto salió sobre el total", () => {
        expect(describeDelivery(pedido)).toBe("Remitidas 4 de 13")
    })
})

describe("describePendingDelivery", () => {
    it("nombra lo que falta remitir, con la cantidad", () => {
        expect(describePendingDelivery(pedido)).toBe("Optic 9 12-24v (6), Estaca corta (3)")
    })

    it("no dice nada cuando está todo remitido", () => {
        expect(
            describePendingDelivery([{ id: 1, product: "X", quantity: 5, delivered: 5 }]),
        ).toBeNull()
    })

    it("deja afuera las líneas ya remitidas por completo", () => {
        expect(
            describePendingDelivery([
                { id: 1, product: "Optic 9 12-24v", quantity: 10, delivered: 10 },
                { id: 2, product: "Estaca corta", quantity: 3, delivered: 1 },
            ]),
        ).toBe("Estaca corta (2)")
    })

    it("corta en tres y cuenta el resto", () => {
        const muchas = [1, 2, 3, 4, 5].map((n) => ({
            id: n,
            product: `Producto ${n}`,
            quantity: 2,
            delivered: 0,
        }))
        expect(describePendingDelivery(muchas)).toBe(
            "Producto 1 (2), Producto 2 (2), Producto 3 (2) y 2 más",
        )
    })
})

describe("deliveredOverflow", () => {
    it("no marca nada cuando lo remitido entra en lo pedido", () => {
        expect(deliveredOverflow(pedido)).toEqual([])
    })

    it("marca la línea que se achicó después de remitir", () => {
        const achicada = { id: 1, product: "Optic 9 12-24v", quantity: 3, delivered: 5 }
        expect(deliveredOverflow([achicada, pedido[1]])).toEqual([achicada])
    })
})

describe("planDelivery", () => {
    it("sin pedido explícito remite todo lo pendiente", () => {
        expect(planDelivery(pedido, null)).toEqual({
            items: [
                { orderItemId: 1, product: "Optic 9 12-24v", quantity: 6 },
                { orderItemId: 2, product: "Estaca corta", quantity: 3 },
            ],
        })
    })

    it("sin pedido explícito deja afuera las líneas ya remitidas", () => {
        const plan = planDelivery(
            [
                { id: 1, product: "Optic 9 12-24v", quantity: 10, delivered: 10 },
                { id: 2, product: "Estaca corta", quantity: 3, delivered: 0 },
            ],
            null,
        )
        expect(plan).toEqual({ items: [{ orderItemId: 2, product: "Estaca corta", quantity: 3 }] })
    })

    it("no deja remitir un pedido ya remitido por completo", () => {
        const plan = planDelivery([{ id: 1, product: "X", quantity: 5, delivered: 5 }], null)
        expect(plan).toEqual({ error: "El pedido ya está remitido por completo: no hay unidades pendientes." })
    })

    it("permite entregar una parte de lo pendiente", () => {
        expect(planDelivery(pedido, [{ orderItemId: 1, quantity: 2 }])).toEqual({
            items: [{ orderItemId: 1, product: "Optic 9 12-24v", quantity: 2 }],
        })
    })

    it("ignora las filas en cero del diálogo", () => {
        const plan = planDelivery(pedido, [
            { orderItemId: 1, quantity: 6 },
            { orderItemId: 2, quantity: 0 },
        ])
        expect(plan).toEqual({ items: [{ orderItemId: 1, product: "Optic 9 12-24v", quantity: 6 }] })
    })

    it("rechaza remitir más de lo que queda pendiente", () => {
        const plan = planDelivery(pedido, [{ orderItemId: 1, quantity: 7 }])
        expect(plan).toEqual({
            error: "Optic 9 12-24v: 7 supera las 6 unidades pendientes.",
        })
    })

    it("suma las filas repetidas antes de comparar contra el pendiente", () => {
        const plan = planDelivery(pedido, [
            { orderItemId: 1, quantity: 4 },
            { orderItemId: 1, quantity: 4 },
        ])
        expect(plan).toEqual({
            error: "Optic 9 12-24v: 8 supera las 6 unidades pendientes.",
        })
    })

    it("avisa distinto cuando la línea ya salió entera", () => {
        const plan = planDelivery(
            [{ id: 1, product: "Optic 9 12-24v", quantity: 10, delivered: 10 }],
            [{ orderItemId: 1, quantity: 1 }],
        )
        expect(plan).toEqual({ error: "Optic 9 12-24v: ya está remitido por completo." })
    })

    it("rechaza una línea que no es del pedido", () => {
        expect(planDelivery(pedido, [{ orderItemId: 99, quantity: 1 }])).toEqual({
            error: "Hay una línea que no pertenece a este pedido.",
        })
    })

    it("no remite nada si el diálogo vino todo en cero", () => {
        expect(planDelivery(pedido, [{ orderItemId: 1, quantity: 0 }])).toEqual({
            error: "No se indicó ninguna cantidad a remitir.",
        })
    })
})
