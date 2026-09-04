import { describe, it, expect } from "vitest"
import { formatStock } from "@/lib/format"

// Las columnas de stock son numeric(12,2) y el driver las devuelve como string:
// estos casos son los que llegan de verdad desde la base.
describe("formatStock", () => {
    it("no muestra decimales cuando la cantidad es entera", () => {
        expect(formatStock("12.00")).toBe("12")
        expect(formatStock(12)).toBe("12")
        expect(formatStock("0.00")).toBe("0")
    })

    it("muestra los decimales que hacen falta, con coma", () => {
        expect(formatStock("1.75")).toBe("1,75")
        expect(formatStock(2.5)).toBe("2,5")
    })

    it("recorta los ceros de la derecha: 1,70 metros es 1,7", () => {
        expect(formatStock("1.70")).toBe("1,7")
    })

    it("separa los miles con punto", () => {
        expect(formatStock("1234.50")).toBe("1.234,5")
        expect(formatStock("1234567.25")).toBe("1.234.567,25")
    })

    it("mantiene el signo de los negativos", () => {
        expect(formatStock(-3.5)).toBe("-3,5")
    })

    it("cae en 0 con valores que no son número", () => {
        expect(formatStock(null)).toBe("0")
        expect(formatStock(undefined)).toBe("0")
        expect(formatStock("")).toBe("0")
        expect(formatStock("abc")).toBe("0")
    })
})
