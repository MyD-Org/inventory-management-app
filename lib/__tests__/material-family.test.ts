import { describe, expect, it } from "vitest"
import {
    defaultOption,
    familyUnitCost,
    familyLineOptions,
    lineFromFamily,
    mergeFamilyOptions,
    syncLineWithFamily,
    type FamilyLineFields,
    type MaterialFamily,
} from "@/lib/material-family"

// La familia del caso real: la tira LED, que varía por color y se costea con la
// cálida.
const tiraLed = (over: Partial<MaterialFamily> = {}): MaterialFamily => ({
    id: 7,
    name: "Tira LED",
    specFieldKey: "led_color",
    defaultSpecValue: "calido",
    costStrategy: "average",
    costMaterialId: null,
    options: [
        { specValue: "blanco", materialId: 10, label: "Tira LED blanca", unitCost: 900, barcode: "A10" },
        { specValue: "calido", materialId: 11, label: "Tira LED cálida", unitCost: 1000, barcode: "A11" },
        { specValue: "rgb", materialId: 12, label: "Tira LED RGB", unitCost: 1500, barcode: "A12" },
    ],
    ...over,
})

// Una línea de hoja de costo ya vinculada a la familia, con el costo con el que
// se calculó el producto.
const linea = (over: Partial<FamilyLineFields> = {}): FamilyLineFields => ({
    familyId: 7,
    label: "Tira LED",
    materialId: 11,
    unitCost: 1000,
    specFieldKey: "led_color",
    options: [
        { specValue: "blanco", materialId: 10, label: "Tira LED blanca" },
        { specValue: "calido", materialId: 11, label: "Tira LED cálida" },
        { specValue: "rgb", materialId: 12, label: "Tira LED RGB" },
    ],
    ...over,
})

describe("defaultOption", () => {
    it("devuelve la variante con la que se costea", () => {
        expect(defaultOption(tiraLed())?.materialId).toBe(11)
    })

    it("cae a la primera si la predeterminada no está cargada", () => {
        expect(defaultOption(tiraLed({ defaultSpecValue: null }))?.materialId).toBe(10)
        expect(defaultOption(tiraLed({ defaultSpecValue: "verde" }))?.materialId).toBe(10)
    })

    it("no rompe con una familia sin variantes", () => {
        expect(defaultOption(tiraLed({ options: [] }))).toBeUndefined()
    })

    it("cuando un color tiene varios materiales, usa el marcado como default", () => {
        const family = tiraLed({
            options: [
                { specValue: "calido", materialId: 11, label: "Tira LED cálida A", unitCost: 1000, barcode: "A11" },
                { specValue: "calido", materialId: 111, label: "Tira LED cálida B", unitCost: 1050, barcode: "A111", isDefault: true },
                { specValue: "blanco", materialId: 10, label: "Tira LED blanca", unitCost: 900, barcode: "A10" },
            ],
        })
        expect(defaultOption(family)?.materialId).toBe(111)
    })
})

describe("familyUnitCost", () => {
    it("promedia todos los materiales por defecto", () => {
        // 900 + 1000 + 1500 = 3400 / 3
        expect(familyUnitCost(tiraLed())).toBeCloseTo(1133.33, 2)
    })

    it("calcula el promedio de todos los materiales de la familia", () => {
        const family = tiraLed({
            costStrategy: "average",
            options: [
                { specValue: "calido", materialId: 11, label: "A", unitCost: 1000, barcode: "A" },
                { specValue: "calido", materialId: 111, label: "B", unitCost: 1200, barcode: "B" },
                { specValue: "blanco", materialId: 10, label: "C", unitCost: 900, barcode: "C" },
            ],
        })
        expect(familyUnitCost(family)).toBeCloseTo(1033.33, 2)
    })

    it("usa el material más caro de toda la familia", () => {
        const family = tiraLed({
            costStrategy: "highest",
            options: [
                { specValue: "calido", materialId: 11, label: "A", unitCost: 1000, barcode: "A" },
                { specValue: "calido", materialId: 111, label: "B", unitCost: 1200, barcode: "B" },
                { specValue: "blanco", materialId: 10, label: "C", unitCost: 900, barcode: "C" },
            ],
        })
        expect(familyUnitCost(family)).toBe(1200)
    })

    it("usa el material específico elegido para costear", () => {
        const family = tiraLed({
            costStrategy: "specific",
            costMaterialId: 111,
            options: [
                { specValue: "calido", materialId: 11, label: "A", unitCost: 1000, barcode: "A" },
                { specValue: "calido", materialId: 111, label: "B", unitCost: 1200, barcode: "B" },
                { specValue: "blanco", materialId: 10, label: "C", unitCost: 900, barcode: "C" },
            ],
        })
        expect(familyUnitCost(family)).toBe(1200)
    })

    // La variante predeterminada ya no interviene en el costo: se quitó la
    // estrategia que la usaba (ver migración 24). Sigue definiendo qué material
    // arrastra la línea de la hoja, eso lo cubre defaultOption.
    it("no depende de la variante predeterminada", () => {
        expect(familyUnitCost(tiraLed({ defaultSpecValue: null }))).toBeCloseTo(1133.33, 2)
    })
})

describe("lineFromFamily", () => {
    // El material que arrastra la línea sale de la variante predeterminada; el
    // costo, en cambio, de la estrategia de costeo. Son dos cosas distintas.
    it("arma la línea entera: nombre general, campo, variantes y costo de la estrategia", () => {
        expect(lineFromFamily(tiraLed())).toEqual({
            familyId: 7,
            label: "Tira LED",
            materialId: 11,
            unitCost: 3400 / 3,
            specFieldKey: "led_color",
            options: [
                { specValue: "blanco", materialId: 10, label: "Tira LED blanca" },
                { specValue: "calido", materialId: 11, label: "Tira LED cálida" },
                { specValue: "rgb", materialId: 12, label: "Tira LED RGB" },
            ],
        })
    })

    it("deja la línea sin material si la familia no tiene variantes", () => {
        const line = lineFromFamily(tiraLed({ options: [] }))
        expect(line.materialId).toBeNull()
        expect(line.unitCost).toBe(0)
    })
})

describe("syncLineWithFamily", () => {
    it("no toca una línea cargada a mano", () => {
        const manual = linea({ familyId: null })
        expect(syncLineWithFamily(manual, tiraLed())).toBe(manual)
    })

    it("trae las variantes que la familia tiene HOY", () => {
        const family = tiraLed({
            options: [
                { specValue: "blanco", materialId: 10, label: "Tira LED blanca", unitCost: 900, barcode: "A10" },
                // El cálido pasó a ser otro material y apareció el azul.
                { specValue: "calido", materialId: 99, label: "Tira LED cálida nueva", unitCost: 1200, barcode: "A99" },
                { specValue: "azul", materialId: 13, label: "Tira LED azul", unitCost: 1100, barcode: "A13" },
            ],
        })
        const synced = syncLineWithFamily(linea(), family)
        expect(synced.options).toEqual([
            { specValue: "blanco", materialId: 10, label: "Tira LED blanca" },
            { specValue: "calido", materialId: 99, label: "Tira LED cálida nueva" },
            { specValue: "azul", materialId: 13, label: "Tira LED azul" },
        ])
        // La referencia sigue a la predeterminada de la familia...
        expect(synced.materialId).toBe(99)
        // ...pero el costo con el que se calculó el producto NO se mueve solo.
        expect(synced.unitCost).toBe(1000)
    })

    it("sigue el renombre de la familia", () => {
        expect(syncLineWithFamily(linea(), tiraLed({ name: "Tira LED SMD" })).label).toBe("Tira LED SMD")
    })

    it("desvincula la línea si la familia ya no existe, sin perder el mapeo", () => {
        const synced = syncLineWithFamily(linea(), undefined)
        expect(synced.familyId).toBeNull()
        expect(synced.options).toEqual(linea().options)
        expect(synced.materialId).toBe(11)
    })
})

describe("familyLineOptions", () => {
    // El caso que rompía al guardar: un color con dos materiales. La familia los tiene
    // como alternativas, pero la línea guarda uno solo por variante.
    const conAlternativas = () =>
        tiraLed({
            options: [
                { specValue: "calido", materialId: 11, label: "Cálida SG", unitCost: 1000, barcode: "A", isDefault: true },
                { specValue: "calido", materialId: 111, label: "Cálida Cree", unitCost: 1200, barcode: "B", isDefault: false },
                { specValue: "blanco", materialId: 10, label: "Blanca", unitCost: 900, barcode: "C", isDefault: true },
            ],
        })

    it("deja una sola opción por variante", () => {
        const options = familyLineOptions(conAlternativas())
        expect(options).toHaveLength(2)
        expect(options.map((o) => o.specValue)).toEqual(["calido", "blanco"])
    })

    it("elige el material marcado como default de cada variante", () => {
        expect(familyLineOptions(conAlternativas())[0].materialId).toBe(11)
    })

    it("cae al primero si la variante no tiene ninguno marcado", () => {
        const family = tiraLed({
            options: [
                { specValue: "calido", materialId: 11, label: "A", unitCost: 1000, barcode: "A", isDefault: false },
                { specValue: "calido", materialId: 111, label: "B", unitCost: 1200, barcode: "B", isDefault: false },
            ],
        })
        expect(familyLineOptions(family)[0].materialId).toBe(11)
    })

    it("la línea que arma lineFromFamily no repite variantes", () => {
        const specValues = lineFromFamily(conAlternativas()).options.map((o) => o.specValue)
        expect(new Set(specValues).size).toBe(specValues.length)
    })

    it("sincronizar una línea tampoco repite variantes", () => {
        const line = syncLineWithFamily(linea(), conAlternativas())
        const specValues = line.options.map((o) => o.specValue)
        expect(new Set(specValues).size).toBe(specValues.length)
    })
})

describe("mergeFamilyOptions", () => {
    // "Optica individual" con dos grados ya cargados, el caso que motivó la tool.
    const existentes = [
        { specValue: "15º", materialId: 100, isDefault: true },
        { specValue: "30º", materialId: 101, isDefault: true },
    ]

    it("agrega variantes nuevas sin tocar las que ya estaban", () => {
        const { options, added } = mergeFamilyOptions(existentes, [
            { specValue: "75º", materialId: 422 },
            { specValue: "5º", materialId: 639 },
        ])
        expect(options).toHaveLength(4)
        expect(options.slice(0, 2)).toEqual(existentes)
        expect(added.map((o) => o.specValue)).toEqual(["75º", "5º"])
    })

    it("marca como default el primer material de una variante nueva", () => {
        const { added } = mergeFamilyOptions(existentes, [{ specValue: "75º", materialId: 422 }])
        expect(added[0].isDefault).toBe(true)
    })

    it("no toca el default de una variante que ya existe", () => {
        const { options, added } = mergeFamilyOptions(existentes, [{ specValue: "15º", materialId: 999 }])
        expect(added[0].isDefault).toBe(false)
        // El que ya costeaba la variante sigue siendo el default.
        expect(options.find((o) => o.materialId === 100)?.isDefault).toBe(true)
    })

    it("es idempotente: repetir una variante ya cargada no la duplica", () => {
        const { options, added, skipped } = mergeFamilyOptions(existentes, [
            { specValue: "15º", materialId: 100 },
        ])
        expect(options).toEqual(existentes)
        expect(added).toEqual([])
        expect(skipped).toEqual([{ specValue: "15º", materialId: 100 }])
    })

    it("no puede borrar variantes: el resultado siempre contiene a las existentes", () => {
        const { options } = mergeFamilyOptions(existentes, [])
        expect(options).toEqual(existentes)
    })

    it("compara ignorando espacios y mayúsculas para no duplicar la misma variante", () => {
        const { added, skipped } = mergeFamilyOptions(existentes, [{ specValue: " 15º ", materialId: 100 }])
        expect(added).toEqual([])
        expect(skipped).toHaveLength(1)
    })

    it("dos materiales para una misma variante nueva: solo el primero es default", () => {
        const { added } = mergeFamilyOptions(existentes, [
            { specValue: "75º", materialId: 422 },
            { specValue: "75º", materialId: 423 },
        ])
        expect(added.map((o) => o.isDefault)).toEqual([true, false])
    })
})
