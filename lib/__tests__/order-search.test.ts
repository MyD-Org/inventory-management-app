import { describe, expect, it } from "vitest"
import { matchesOrderQuery, type SearchableOrder } from "@/lib/order-search"

const pedido = (over: Partial<SearchableOrder> = {}): SearchableOrder => ({
    order_number: 128,
    customer_name: "Juan Pérez",
    customer_external_id: "CLI-7",
    reference: "OC-4821",
    status: "por_facturar",
    items: [{ product: "Fuente switching 24V 6.5A" }],
    ...over,
})

describe("matchesOrderQuery", () => {
    it("sin texto no filtra nada", () => {
        expect(matchesOrderQuery(pedido(), "")).toBe(true)
        expect(matchesOrderQuery(pedido(), "   ")).toBe(true)
    })

    it("encuentra por número, con o sin #", () => {
        expect(matchesOrderQuery(pedido(), "128")).toBe(true)
        expect(matchesOrderQuery(pedido(), "#128")).toBe(true)
        expect(matchesOrderQuery(pedido(), "999")).toBe(false)
    })

    it("encuentra por cliente ignorando tildes y mayúsculas", () => {
        expect(matchesOrderQuery(pedido(), "perez")).toBe(true)
        expect(matchesOrderQuery(pedido(), "PÉREZ")).toBe(true)
        expect(matchesOrderQuery(pedido(), "CLI-7")).toBe(true)
    })

    it("encuentra por la referencia, entera o por un pedazo", () => {
        expect(matchesOrderQuery(pedido(), "OC-4821")).toBe(true)
        expect(matchesOrderQuery(pedido(), "4821")).toBe(true)
        // Sin referencia cargada no la encuentra por el código de otro pedido.
        expect(matchesOrderQuery(pedido({ reference: null }), "4821")).toBe(false)
    })

    it("encuentra por producto", () => {
        expect(matchesOrderQuery(pedido(), "fuente")).toBe(true)
        expect(matchesOrderQuery(pedido(), "24v")).toBe(true)
    })

    it("encuentra por estado, por la etiqueta o por la clave", () => {
        expect(matchesOrderQuery(pedido(), "preparando entrega")).toBe(true)
        expect(matchesOrderQuery(pedido(), "facturar")).toBe(true)
        expect(matchesOrderQuery(pedido({ status: "cancelado" }), "cancelado")).toBe(true)
        expect(matchesOrderQuery(pedido(), "cancelado")).toBe(false)
    })

    it("las palabras pueden venir de campos distintos", () => {
        expect(matchesOrderQuery(pedido(), "perez fuente")).toBe(true)
        expect(matchesOrderQuery(pedido(), "perez cancelado")).toBe(false)
    })
})
