import { describe, expect, it } from "vitest"
import {
    BOARD_STATUSES,
    customerStatus,
    ORDER_STATUSES,
    STATUS_LABELS,
} from "@/lib/order-statuses"

describe("estados del pedido", () => {
    it("el tablero muestra todos los estados menos cancelado", () => {
        expect(BOARD_STATUSES).not.toContain("cancelado")
        expect(BOARD_STATUSES).toHaveLength(ORDER_STATUSES.length - 1)
    })

    it("empieza en por_revisar y termina en retirado", () => {
        expect(BOARD_STATUSES[0]).toBe("por_revisar")
        expect(BOARD_STATUSES[BOARD_STATUSES.length - 1]).toBe("retirado")
    })

    it("todos los estados tienen etiqueta", () => {
        for (const s of ORDER_STATUSES) {
            expect(STATUS_LABELS[s]).toBeTruthy()
        }
    })

    it("no filtra la jerga interna al cliente", () => {
        // 'por_revisar' y 'embalado' son del taller: el cliente no tiene por qué
        // enterarse de que su pedido está siendo revisado.
        expect(customerStatus("por_revisar")).toBe("Recibido")
        expect(customerStatus("embalado")).toBe("En preparación")
        expect(customerStatus("retirado")).toBe("Entregado")
    })

    it("el mapa configurable pisa el default", () => {
        expect(customerStatus("en_proceso", { en_proceso: "Lo estamos armando" })).toBe(
            "Lo estamos armando",
        )
    })

    it("cae al default si la clave no está configurada", () => {
        expect(customerStatus("en_proceso", { retirado: "Listo" })).toBe("En fabricación")
    })

    it("un estado desconocido se devuelve tal cual en vez de romper", () => {
        expect(customerStatus("inventado")).toBe("inventado")
    })
})
