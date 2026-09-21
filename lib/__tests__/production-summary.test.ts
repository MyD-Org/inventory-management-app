import { describe, expect, it } from "vitest"
import { parseProductionStatuses, summarizeProduction, type ProductionLine } from "@/lib/production-summary"
import type { SpecField } from "@/lib/order-validation"

const vocab: Record<string, SpecField> = {
    led_color: {
        label: "Color de LED",
        options: ["calido", "frio"],
        free_text: false,
        kind: "list",
        labels: { calido: "Cálido", frio: "Frío" },
    },
    optic: { label: "Óptica", options: ["30", "60"], free_text: false, kind: "list", labels: { "30": "30°", "60": "60°" } },
    stake: { label: "Estaca", options: [], free_text: false, kind: "boolean", labels: {} },
    other: { label: "Otras indicaciones", options: [], free_text: true, kind: "text", labels: {} },
}

function line(over: Partial<ProductionLine>): ProductionLine {
    return {
        order_id: 1,
        order_number: 100,
        customer_name: "Pérez",
        status: "recibido",
        delivery_date_estimate: null,
        budget_id: 3,
        product: "Optic 1",
        specs: {},
        quantity: 1,
        delivered: 0,
        ...over,
    }
}

// El caso que motivó la vista: dos clientes piden el mismo producto.
const dosClientes: ProductionLine[] = [
    line({ order_id: 1, order_number: 118, customer_name: "Pérez", quantity: 4, specs: { led_color: "calido", optic: "30" } }),
    line({ order_id: 2, order_number: 121, customer_name: "Gómez", quantity: 3, specs: { led_color: "frio", optic: "60" } }),
    line({ order_id: 2, order_number: 121, customer_name: "Gómez", quantity: 1, specs: { led_color: "calido", optic: "30" } }),
]

describe("summarizeProduction", () => {
    it("junta en un grupo las líneas del mismo producto, de pedidos distintos", () => {
        const { groups } = summarizeProduction(dosClientes, vocab)
        expect(groups).toHaveLength(1)
        expect(groups[0].product).toBe("Optic 1")
        expect(groups[0].units).toBe(8)
        expect(groups[0].orders).toBe(2)
    })

    it("las columnas llevan el nombre de la variación, en el orden del vocabulario", () => {
        const [g] = summarizeProduction(dosClientes, vocab).groups
        expect(g.fields.map((f) => f.label)).toEqual(["Color de LED", "Óptica", "Estaca", "Otras indicaciones"])
    })

    it("arma las combinaciones exactas, la más pedida primero", () => {
        const [g] = summarizeProduction(dosClientes, vocab).groups
        expect(g.combos.map((c) => [c.values, c.units])).toEqual([
            [["Cálido", "30°", "Sin estaca", "Sin especificar"], 5],
            [["Frío", "60°", "Sin estaca", "Sin especificar"], 3],
        ])
    })

    it("cada combinación sabe de qué pedidos sale, el más urgente primero", () => {
        const [g] = summarizeProduction(
            [
                line({ order_id: 1, order_number: 118, customer_name: "Pérez", quantity: 4, delivery_date_estimate: "2026-10-20", specs: { led_color: "calido" } }),
                line({ order_id: 2, order_number: 121, customer_name: "Gómez", quantity: 1, delivery_date_estimate: "2026-10-05", specs: { led_color: "calido" } }),
                line({ order_id: 2, order_number: 121, customer_name: "Gómez", quantity: 3, delivery_date_estimate: "2026-10-05", specs: { led_color: "frio" } }),
            ],
            vocab,
        ).groups
        expect(g.combos[0].lines.map((l) => [l.order_number, l.customer_name, l.units])).toEqual([
            [121, "Gómez", 1],
            [118, "Pérez", 4],
        ])
        expect(g.combos[1].lines.map((l) => l.order_number)).toEqual([121])
    })

    it("muestra todas las columnas del pedido, aunque ninguna línea las use", () => {
        const [g] = summarizeProduction([line({ specs: {} })], vocab).groups
        expect(g.fields).toHaveLength(4)
        expect(g.combos[0].values).toEqual(["Sin especificar", "Sin especificar", "Sin estaca", "Sin especificar"])
    })

    it("cuenta lo que falta remitir, no lo pedido, y saltea lo ya remitido entero", () => {
        const { groups, units } = summarizeProduction(
            [
                line({ quantity: 10, delivered: 4, specs: { led_color: "calido" } }),
                line({ order_id: 2, order_number: 101, quantity: 3, delivered: 3, specs: { led_color: "frio" } }),
            ],
            vocab,
        )
        expect(units).toBe(6)
        expect(groups[0].orders).toBe(1)
        expect(groups[0].combos.map((c) => [c.values[0], c.units])).toEqual([["Cálido", 6]])
    })

    it("una línea que no eligió un campo que otras sí cuenta como 'Sin especificar'", () => {
        const [g] = summarizeProduction(
            [line({ quantity: 2, specs: { led_color: "calido" } }), line({ quantity: 1, specs: {} })],
            vocab,
        ).groups
        expect(g.combos.map((c) => [c.values[0], c.units])).toEqual([
            ["Cálido", 2],
            ["Sin especificar", 1],
        ])
    })

    it("en un sí/no, no marcar es 'sin': no es un dato que falta", () => {
        const [g] = summarizeProduction(
            [line({ quantity: 2, specs: { stake: "con" } }), line({ quantity: 5, specs: {} })],
            vocab,
        ).groups
        expect(g.combos.map((c) => [c.values[2], c.units])).toEqual([
            ["Sin estaca", 5],
            ["Con estaca", 2],
        ])
    })

    it("muestra el valor crudo si la opción ya no está en el vocabulario", () => {
        const [g] = summarizeProduction([line({ specs: { led_color: "ambar" } })], vocab).groups
        expect(g.combos[0].values[0]).toBe("ambar")
    })

    it("una indicación de texto libre separa la combinación, sin importar mayúsculas", () => {
        const [g] = summarizeProduction(
            [
                line({ quantity: 12, specs: { led_color: "calido", other: "10 metros de cable" } }),
                line({ quantity: 4, specs: { led_color: "calido", other: " 10 Metros de cable " }, order_id: 2 }),
                line({ quantity: 50, specs: { led_color: "calido" }, order_id: 3 }),
            ],
            vocab,
        ).groups
        expect(g.combos.map((c) => [c.values[3], c.units])).toEqual([
            ["Sin especificar", 50],
            ["10 metros de cable", 16],
        ])
    })

    it("un producto sin ficha se agrupa igual, por nombre, y queda marcado", () => {
        const r = summarizeProduction(
            [
                line({ budget_id: null, product: "Estaca 20 cm", quantity: 70 }),
                line({ budget_id: null, product: "estaca  20 CM", quantity: 19, order_id: 2 }),
                line({ quantity: 1 }),
            ],
            vocab,
        )
        expect(r.groups.map((g) => [g.product, g.units, g.budget_id])).toEqual([
            ["Estaca 20 cm", 89, null],
            ["Optic 1", 1, 3],
        ])
        expect(r.groups[0].orders).toBe(2)
        expect(r.units).toBe(90)
    })

    it("ordena los productos por la entrega más próxima; sin fecha, al final", () => {
        const r = summarizeProduction(
            [
                line({ budget_id: 1, product: "A", delivery_date_estimate: null, quantity: 50 }),
                line({ budget_id: 2, product: "B", delivery_date_estimate: "2026-10-10" }),
                line({ budget_id: 3, product: "C", delivery_date_estimate: "2026-10-02" }),
                line({ budget_id: 3, product: "C", delivery_date_estimate: "2026-11-01", order_id: 9, order_number: 109 }),
            ],
            vocab,
        )
        expect(r.groups.map((g) => g.product)).toEqual(["C", "B", "A"])
        expect(r.groups[0].nextDelivery).toBe("2026-10-02")
    })

    it("dentro del producto, los pedidos van por fecha de entrega", () => {
        const [g] = summarizeProduction(
            [
                line({ order_id: 1, order_number: 118, delivery_date_estimate: "2026-10-20" }),
                line({ order_id: 2, order_number: 121, delivery_date_estimate: "2026-10-05" }),
                line({ order_id: 3, order_number: 124, delivery_date_estimate: null }),
            ],
            vocab,
        ).groups
        expect(g.lines.map((l) => l.order_number)).toEqual([121, 118, 124])
    })

    it("no arrastra errores de float al sumar decimales", () => {
        const [g] = summarizeProduction(
            [line({ quantity: 0.1 }), line({ order_id: 2, quantity: 0.2 })],
            vocab,
        ).groups
        expect(g.units).toBe(0.3)
    })
})

describe("parseProductionStatuses", () => {
    it("sin parámetro muestra lo que el taller tiene que armar", () => {
        expect(parseProductionStatuses(undefined)).toEqual(["recibido", "en_proceso"])
    })

    it("acepta 'por revisar' si se lo piden, y devuelve el orden del tablero", () => {
        expect(parseProductionStatuses("en_proceso,por_revisar")).toEqual(["por_revisar", "en_proceso"])
    })

    it("ignora estados que esta vista no muestra y cae a los de por defecto", () => {
        expect(parseProductionStatuses("retirado,pepito")).toEqual(["recibido", "en_proceso"])
    })
})
