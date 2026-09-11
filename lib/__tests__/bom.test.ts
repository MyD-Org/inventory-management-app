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

    it("no elige ningún material cuando el valor no está mapeado", () => {
        const r = resolveBomLine(tiraLed(), { led_color: "neutro" })
        expect(r.materialId).toBeNull()
        expect(r.substituted).toBe(false)
        expect(r.unmapped).toBe("led_color=neutro")
    })

    it("cuando un color tiene varios materiales, usa el marcado como default", () => {
        const line = tiraLed({
            options: [
                { specValue: "calido", materialId: 11, label: "Cálida A" },
                { specValue: "calido", materialId: 110, label: "Cálida B", isDefault: true },
                { specValue: "blanco", materialId: 10, label: "Blanca" },
            ],
        })
        const r = resolveBomLine(line, { led_color: "calido" })
        expect(r.materialId).toBe(110)
        expect(r.label).toBe("Cálida B")
        expect(r.substituted).toBe(true)
    })

    it("avisa también si la línea declara un campo pero no tiene ninguna variante cargada", () => {
        const r = resolveBomLine(tiraLed({ options: [] }), { led_color: "calido" })
        expect(r.materialId).toBeNull()
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

    it("saca del BOM las líneas sin mapear, pero deja las que resolvieron", () => {
        const { lines, unmapped } = resolveBom([tiraLed(), fuente], { led_color: "neutro" }, 2)
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ materialId: 20, qtyTotal: 2 })
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

// ── Cantidad por variante ────────────────────────────────────────────────────
// El caso real: la grampa la elige el cliente y arrastra la cantidad de otras dos
// líneas. El tornillo y la arandela son EL MISMO material con las dos grampas;
// lo único que cambia es cuánto sale del depósito.
//   grampa corta -> 1 tornillo, 2 arandelas
//   grampa larga -> 2 tornillos, 4 arandelas
const arandela = (over: Partial<BomLine> = {}): BomLine => ({
    id: 3,
    materialId: 30,
    label: "Arandela 6mm",
    qty: 2,
    specFieldKey: "clamp",
    options: [
        { specValue: "corta", materialId: 30, label: "Arandela 6mm", qty: 2 },
        { specValue: "larga", materialId: 30, label: "Arandela 6mm", qty: 4 },
    ],
    ...over,
})

describe("cantidad por variante", () => {
    it("usa la cantidad de la variante en lugar de la de la línea", () => {
        expect(resolveBomLine(arandela(), { clamp: "larga" }).qty).toBe(4)
        expect(resolveBomLine(arandela(), { clamp: "corta" }).qty).toBe(2)
    })

    it("cae a la cantidad de la línea cuando la variante no declara una", () => {
        const sinQty = arandela({
            options: [{ specValue: "larga", materialId: 30, label: "Arandela 6mm" }],
        })
        expect(resolveBomLine(sinQty, { clamp: "larga" }).qty).toBe(2)
    })

    it("null es lo mismo que no declararla", () => {
        const nula = arandela({
            options: [{ specValue: "larga", materialId: 30, label: "Arandela 6mm", qty: null }],
        })
        expect(resolveBomLine(nula, { clamp: "larga" }).qty).toBe(2)
    })

    it("las variantes no tocan la línea cuando el pedido no dice nada", () => {
        expect(resolveBomLine(arandela(), {}).qty).toBe(2)
    })

    it("multiplica por la cantidad del pedido", () => {
        const { lines } = resolveBom([arandela()], { clamp: "larga" }, 3)
        expect(lines).toHaveLength(1)
        expect(lines[0].qty).toBe(4)
        expect(lines[0].qtyTotal).toBe(12)
    })

    it("una variante en 0 saca la línea del BOM y NO la reporta como sin mapear", () => {
        // "La tapa de acrílico solo va si eligieron acrílico": con chapa la hoja
        // sabe perfectamente qué pasa —no va nada—, así que no hay nada que avisar.
        const tapa = arandela({
            label: "Tapa de acrílico",
            options: [
                { specValue: "corta", materialId: 30, label: "Tapa de acrílico", qty: 1 },
                { specValue: "larga", materialId: 30, label: "Tapa de acrílico", qty: 0 },
            ],
        })
        const { lines, unmapped } = resolveBom([tapa], { clamp: "larga" }, 5)
        expect(lines).toHaveLength(0)
        expect(unmapped).toEqual([])
    })

    it("el 0 no se confunde con 'no declara cantidad'", () => {
        // Un `option.qty || line.qty` haría descontar 2 arandelas donde no va ninguna.
        const cero = arandela({
            options: [{ specValue: "larga", materialId: 30, label: "Arandela 6mm", qty: 0 }],
        })
        expect(resolveBomLine(cero, { clamp: "larga" }).qty).toBe(0)
    })

    it("convive con la sustitución de material: cambia el material Y la cantidad", () => {
        const grampa: BomLine = {
            id: 4,
            materialId: 40,
            label: "Grampa corta",
            qty: 1,
            specFieldKey: "clamp",
            options: [
                { specValue: "corta", materialId: 40, label: "Grampa corta", qty: 1 },
                { specValue: "larga", materialId: 41, label: "Grampa larga", qty: 2 },
            ],
        }
        const r = resolveBomLine(grampa, { clamp: "larga" })
        expect(r.materialId).toBe(41)
        expect(r.label).toBe("Grampa larga")
        expect(r.qty).toBe(2)
        expect(r.substituted).toBe(true)
    })
})

describe("resolveBomLine con familia manual", () => {
    // Línea vinculada a una familia MANUAL: sin campo de variación. El material de
    // referencia sale de la línea; el vínculo con la familia se conserva para que
    // al consumir se ofrezcan las alternativas del grupo (scripts/41-familia-manual.sql).
    const tornilleria: BomLine = {
        id: 1,
        familyId: 9,
        materialId: 22,
        label: "Tornillería",
        qty: 20,
        specFieldKey: null,
        options: [],
    }

    it("conserva el vínculo con la familia y el spec_value sentinela", () => {
        const r = resolveBomLine(tornilleria, {})
        expect(r.materialId).toBe(22)
        expect(r.substituted).toBe(false)
        expect(r.familyId).toBe(9)
        expect(r.specValue).toBe("")
    })

    it("no confunde con una línea suelta: esa no lleva familia", () => {
        const r = resolveBomLine({ ...tornilleria, familyId: null }, {})
        expect(r.familyId).toBeNull()
        expect(r.specValue).toBeNull()
    })
})
