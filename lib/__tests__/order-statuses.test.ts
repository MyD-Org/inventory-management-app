import { describe, expect, it } from "vitest"
import {
    BOARD_STATUSES,
    customerStatus,
    ORDER_STATUSES,
    orderCustomerLabel,
    STATUS_LABELS,
} from "@/lib/order-statuses"

describe("estados del pedido", () => {
    it("el tablero muestra todos los estados menos cancelado y en_deposito", () => {
        expect(BOARD_STATUSES).not.toContain("cancelado")
        expect(BOARD_STATUSES).not.toContain("en_deposito")
        expect(BOARD_STATUSES).toHaveLength(ORDER_STATUSES.length - 2)
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
        // 'por_revisar' y 'por_facturar' son del taller: el cliente no tiene por qué
        // enterarse de la jerga interna.
        expect(customerStatus("por_revisar")).toBe("Recibido")
        expect(customerStatus("por_facturar")).toBe("Preparando entrega")
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

    it("en_deposito tiene etiqueta para el taller y para el cliente", () => {
        expect(STATUS_LABELS.en_deposito).toBe("En depósito")
    })

    it("los pedidos para stock se nombran Producción propia", () => {
        expect(
            orderCustomerLabel({ for_stock: true, customer_name: null, customer_external_id: "stock" }),
        ).toBe("Producción propia")
        expect(
            orderCustomerLabel({ for_stock: false, customer_name: "Juan", customer_external_id: "alegra:1" }),
        ).toBe("Juan")
        expect(
            orderCustomerLabel({ for_stock: false, customer_name: null, customer_external_id: "manual:juan" }),
        ).toBe("manual:juan")
    })
})
