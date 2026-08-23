import { describe, expect, it } from "vitest"
import { validateOrderPayloadWith, validateSpecs, type SpecField } from "@/lib/order-validation"

// Vocabulario de prueba con los tres tipos de campo que existen.
const vocab: Record<string, SpecField> = {
    clamp: {
        label: "Grampa",
        options: ["larga", "corta"],
        free_text: false,
        kind: "list",
        labels: { larga: "Larga", corta: "Corta" },
    },
    stake: {
        label: "Estaca",
        options: ["con", "sin"],
        free_text: false,
        kind: "boolean",
        labels: { con: "Con estaca", sin: "Sin estaca" },
    },
    other: {
        label: "Otras indicaciones",
        options: [],
        free_text: true,
        kind: "text",
        labels: {},
    },
}

const pedido = (over: any = {}) => ({
    external_id: "wa_1",
    customer: { external_id: "alegra:1" },
    items: [{ product: "Optic 1", quantity: 1 }],
    ...over,
})

describe("validateSpecs", () => {
    it("acepta un valor de la lista", () => {
        expect(validateSpecs({ clamp: "larga" }, vocab)).toEqual([])
    })

    it("rechaza un valor que no está en la lista, y dice cuáles valen", () => {
        const [error] = validateSpecs({ clamp: "mediana" }, vocab)
        expect(error).toContain("mediana")
        expect(error).toContain("larga, corta")
    })

    it("rechaza un campo que no existe en el vocabulario", () => {
        expect(validateSpecs({ inventado: "x" }, vocab)[0]).toContain("desconocido")
    })

    it("deja pasar cualquier cosa en un campo de texto libre", () => {
        expect(validateSpecs({ other: "con cable extra largo" }, vocab)).toEqual([])
    })

    it("vacío no es error: significa sin especificar", () => {
        expect(validateSpecs({ clamp: "" }, vocab)).toEqual([])
    })

    it("un booleano solo acepta con o sin", () => {
        expect(validateSpecs({ stake: "con" }, vocab)).toEqual([])
        expect(validateSpecs({ stake: "sin" }, vocab)).toEqual([])
        expect(validateSpecs({ stake: "true" }, vocab)[0]).toContain("Válidos: con, sin")
    })
})

describe("validateOrderPayloadWith", () => {
    it("acepta el payload del doc del CRM", () => {
        const errores = validateOrderPayloadWith(
            {
                external_id: "wa_5493511234567_1755712800",
                origin: "whatsapp",
                customer: { external_id: "alegra:1234", name: "Iluminación del Centro SRL" },
                items: [
                    {
                        product: "PROY-30W",
                        quantity: 20,
                        specs: { clamp: "larga", other: "" },
                    },
                ],
                delivery_date_estimate: "2026-09-05",
                priority: "normal",
            },
            vocab,
        )
        expect(errores).toEqual([])
    })

    it("exige external_id: es la clave de idempotencia", () => {
        expect(validateOrderPayloadWith(pedido({ external_id: "" }), vocab)).toContain(
            "Falta external_id",
        )
    })

    it("exige el cliente", () => {
        const errores = validateOrderPayloadWith(
            pedido({ customer: { external_id: "" } }),
            vocab,
        )
        expect(errores).toContain("Falta customer.external_id")
    })

    it("no acepta un pedido sin items", () => {
        expect(validateOrderPayloadWith(pedido({ items: [] }), vocab)).toContain(
            "El pedido no tiene items",
        )
    })

    it("rechaza cantidades que no sirven", () => {
        for (const quantity of [0, -3, Number.NaN]) {
            const errores = validateOrderPayloadWith(
                pedido({ items: [{ product: "Optic 1", quantity }] }),
                vocab,
            )
            expect(errores.join(" ")).toContain("quantity inválida")
        }
    })

    it("rechaza una prioridad inventada", () => {
        const errores = validateOrderPayloadWith(pedido({ priority: "urgentisimo" }), vocab)
        expect(errores.join(" ")).toContain("priority inválida")
    })

    it("dice en qué item está el problema", () => {
        const errores = validateOrderPayloadWith(
            pedido({
                items: [
                    { product: "Optic 1", quantity: 1 },
                    { product: "Optic 3", quantity: 1, specs: { clamp: "mediana" } },
                ],
            }),
            vocab,
        )
        expect(errores[0]).toContain("Item 2")
    })

    it("los errores de campos faltantes cortan antes de mirar las specs", () => {
        // Si falta el cliente no tiene sentido enumerar además cada spec mala.
        const errores = validateOrderPayloadWith(
            { external_id: "", customer: { external_id: "" }, items: [] },
            vocab,
        )
        expect(errores).toHaveLength(3)
    })
})
