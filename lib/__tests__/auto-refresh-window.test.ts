import { describe, it, expect } from "vitest"
import { withinWorkHours } from "@/lib/auto-refresh-window"

// Fechas locales a propósito: la ventana se evalúa en la hora de la máquina que
// muestra el tablero, no en UTC. new Date(y, m, d, h) construye hora local.
const lunes = (hour: number, min = 0) => new Date(2026, 8, 7, hour, min)

describe("withinWorkHours", () => {
    it("deja pasar el horario del taller", () => {
        expect(withinWorkHours(lunes(7))).toBe(true)
        expect(withinWorkHours(lunes(12, 30))).toBe(true)
        expect(withinWorkHours(lunes(18, 59))).toBe(true)
    })

    it("corta a las 19 en punto, no a las 19:59", () => {
        expect(withinWorkHours(lunes(19))).toBe(false)
        expect(withinWorkHours(lunes(19, 30))).toBe(false)
    })

    it("no abre antes de las 7", () => {
        expect(withinWorkHours(lunes(6, 59))).toBe(false)
        expect(withinWorkHours(lunes(0))).toBe(false)
    })

    it("el fin de semana queda afuera aunque sea horario de taller", () => {
        // 2026-09-12 es sábado, 2026-09-13 domingo.
        expect(withinWorkHours(new Date(2026, 8, 12, 10))).toBe(false)
        expect(withinWorkHours(new Date(2026, 8, 13, 10))).toBe(false)
    })

    it("cubre los cinco días hábiles", () => {
        // 2026-09-07 lunes .. 2026-09-11 viernes.
        for (let d = 7; d <= 11; d++) {
            expect(withinWorkHours(new Date(2026, 8, d, 10))).toBe(true)
        }
    })
})
