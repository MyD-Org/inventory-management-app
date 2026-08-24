import { describe, expect, it } from "vitest"
import { resolveBom, resolveBomLine, sameSpecs, type BomLine } from "@/lib/bom"

// Línea de receta de prueba: la tira LED, que varía por color.
const tiraLed = (over: Partial<BomLine> = {}): BomLine => ({
    id: 1,
    materialId: 10,
    label: "Tira LED blanca",
    qty: 2,
    specFieldKey: "led_color",
    options: [
        { specValue: "blanco", materialId: 10, label: "Tira LED blanca" },
        { specValue: "calido", materialId: 11, label: "Tira LED cálida" },
        { specValue: "rgb", materialId: 12, label: "Tira LED RGB" },
    ],
    ...over,
})

// Línea sin variantes: el caso de la enorme mayoría de las hojas de costo.
const fuente: BomLine = {
    id: 2,
    materialId: 20,
    label: "Fuente 12V",
    qty: 1,
    specFieldKey: null,
    options: [],
}

describe("resolveBomLine", () => {
    it("usa el material de referencia cuando la línea no varía", () => {
        const r = resolveBomLine(fuente, { led_color: "calido" })
        expect(r.materialId).toBe(20)
        expect(r.substituted).toBe(false)
        expect(r.unmapped).toBeNull()
    })

    it("usa el material de referencia cuando el pedido no especifica el color", () => {
        expect(resolveBomLine(tiraLed(), {}).materialId).toBe(10)
        expect(resolveBomLine(tiraLed(), { led_color: "" }).materialId).toBe(10)
        expect(resolveBomLine(tiraLed(), { led_color: null }).materialId).toBe(10)
    })

    it("sustituye por la variante mapeada", () => {
        const r = resolveBomLine(tiraLed(), { led_color: "calido" })
        expect(r.materialId).toBe(11)
        expect(r.label).toBe("Tira LED cálida")
        expect(r.substituted).toBe(true)
        expect(r.unmapped).toBeNull()
    })

    it("mantiene la cantidad de la línea al sustituir", () => {
        expect(resolveBomLine(tiraLed(), { led_color: "rgb" }).qty).toBe(2)
    })

    it("compara el valor como texto (specs llega de un JSONB del bot)", () => {
        const optica = tiraLed({ specFieldKey: "optic", options: [{ specValue: "25", materialId: 30, label: "Óptica 25°" }] })
        expect(resolveBomLine(optica, { optic: 25 }).materialId).toBe(30)
    })

    it("cae al material de referencia y avisa cuando el valor no está mapeado", () => {
        const r = resolveBomLine(tiraLed(), { led_color: "neutro" })
        expect(r.materialId).toBe(10)
        expect(r.substituted).toBe(false)
        expect(r.unmapped).toBe("led_color=neutro")
    })

    it("avisa también si la línea declara un campo pero no tiene ninguna variante cargada", () => {
        const r = resolveBomLine(tiraLed({ options: [] }), { led_color: "calido" })
        expect(r.materialId).toBe(10)
        expect(r.unmapped).toBe("led_color=calido")
    })
})

describe("resolveBom", () => {
    it("multiplica por la cantidad del ítem", () => {
        const { lines } = resolveBom([tiraLed(), fuente], { led_color: "calido" }, 3)
        expect(lines[0]).toMatchObject({ materialId: 11, qty: 2, qtyTotal: 6 })
        expect(lines[1]).toMatchObject({ materialId: 20, qty: 1, qtyTotal: 3 })
    })

    it("no reporta faltantes cuando todo resuelve", () => {
        expect(resolveBom([tiraLed(), fuente], { led_color: "rgb" }, 1).unmapped).toEqual([])
    })

    it("junta los valores sin mapear sin repetirlos", () => {
        const otraTira = tiraLed({ id: 3, materialId: 13, label: "Tira LED secundaria" })
        const { unmapped } = resolveBom([tiraLed(), otraTira, fuente], { led_color: "neutro" }, 1)
        expect(unmapped).toEqual(["led_color=neutro"])
    })

    it("con receta vacía devuelve vacío", () => {
        expect(resolveBom([], { led_color: "calido" }, 5)).toEqual({ lines: [], unmapped: [] })
    })
})

describe("sameSpecs", () => {
    it("ignora el orden de las claves (el JSONB vuelve normalizado)", () => {
        expect(sameSpecs({ clamp: "larga", led_color: "rgb" }, { led_color: "rgb", clamp: "larga" })).toBe(true)
    })

    it("detecta un valor distinto", () => {
        expect(sameSpecs({ clamp: "larga" }, { clamp: "corta" })).toBe(false)
    })

    it("detecta un campo agregado o quitado", () => {
        expect(sameSpecs({ clamp: "larga", optic: "25" }, { clamp: "larga" })).toBe(false)
    })

    it("trata vacío y ausente como lo mismo", () => {
        expect(sameSpecs({ clamp: "larga", other: "" }, { clamp: "larga" })).toBe(true)
        expect(sameSpecs({ clamp: "larga", optic: null }, { clamp: "larga" })).toBe(true)
    })

    it("compara como texto (el bot puede mandar los grados como número)", () => {
        expect(sameSpecs({ optic: 25 }, { optic: "25" })).toBe(true)
    })

    it("dos vacíos son iguales", () => {
        expect(sameSpecs({}, {})).toBe(true)
    })
})
