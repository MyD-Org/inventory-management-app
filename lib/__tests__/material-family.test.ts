import { describe, expect, it } from "vitest"
import {
    defaultOption,
    lineFromFamily,
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
})

describe("lineFromFamily", () => {
    it("arma la línea entera: nombre general, campo, variantes y costo de la predeterminada", () => {
        expect(lineFromFamily(tiraLed())).toEqual({
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
