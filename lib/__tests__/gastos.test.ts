import { describe, expect, it } from "vitest"
import { totalesPorCategoria, validateExpense } from "@/lib/gastos"

const HOY = new Date()
const hoyStr = `${HOY.getFullYear()}-${String(HOY.getMonth() + 1).padStart(2, "0")}-${String(HOY.getDate()).padStart(2, "0")}`
const MANIANA = new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + 1)
const manianaStr = `${MANIANA.getFullYear()}-${String(MANIANA.getMonth() + 1).padStart(2, "0")}-${String(MANIANA.getDate()).padStart(2, "0")}`

const valido = {
    expense_date: hoyStr,
    category_id: 1,
    description: "Factura de luz",
    amount: "96800.00",
    payment_method: "transferencia",
}

describe("validateExpense", () => {
    it("acepta un gasto válido", () => {
        expect(validateExpense(valido, { activeCategoryIds: [1] })).toEqual([])
    })

    it("rechaza monto 0, negativo y no numérico", () => {
        expect(validateExpense({ ...valido, amount: 0 }, { activeCategoryIds: [1] })).toHaveLength(1)
        expect(validateExpense({ ...valido, amount: -5 }, { activeCategoryIds: [1] })).toHaveLength(1)
        expect(validateExpense({ ...valido, amount: "abc" }, { activeCategoryIds: [1] })).toHaveLength(1)
    })

    it("rechaza descripción vacía o solo espacios", () => {
        expect(validateExpense({ ...valido, description: "   " }, { activeCategoryIds: [1] })).toHaveLength(1)
    })

    it("rechaza fecha futura e inválida", () => {
        expect(validateExpense({ ...valido, expense_date: manianaStr }, { activeCategoryIds: [1] })).toHaveLength(1)
        expect(validateExpense({ ...valido, expense_date: "05/09/2026" }, { activeCategoryIds: [1] })).toHaveLength(1)
    })

    it("rechaza categoría inactiva o inexistente", () => {
        expect(validateExpense(valido, { activeCategoryIds: [2] })).toHaveLength(1)
        expect(validateExpense(valido, { activeCategoryIds: [] })).toHaveLength(1)
    })

    it("en edición conserva la categoría aunque se haya desactivado", () => {
        expect(
            validateExpense(valido, { activeCategoryIds: [2], allowInactiveCategoryId: 1 })
        ).toEqual([])
    })

    it("rechaza medio de pago inválido", () => {
        expect(validateExpense({ ...valido, payment_method: "cheque" }, { activeCategoryIds: [1] })).toHaveLength(1)
    })
})

describe("totalesPorCategoria", () => {
    const gastos = [
        { category_id: 1, category_name: "Servicios", amount: "100.00" },
        { category_id: 2, category_name: "Alquiler", amount: "300.00" },
        { category_id: 1, category_name: "Servicios", amount: "100.00" },
    ]

    it("suma por categoría, ordena descendente y calcula el %", () => {
        const totales = totalesPorCategoria(gastos)
        expect(totales).toEqual([
            { category_id: 2, nombre: "Alquiler", monto: 300, pct: 0.6 },
            { category_id: 1, nombre: "Servicios", monto: 200, pct: 0.4 },
        ])
    })

    it("devuelve lista vacía sin gastos", () => {
        expect(totalesPorCategoria([])).toEqual([])
    })
})
