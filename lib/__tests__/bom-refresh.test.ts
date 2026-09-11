import { describe, expect, it } from "vitest"
import { bomRefreshDecision, bomRefreshMessage, BOM_REFRESHABLE_STATUSES } from "@/lib/bom-refresh"
import { ORDER_STATUSES } from "@/lib/order-statuses"

const pedido = (status: string, consumed = false) => ({ status, consumed })

describe("a qué pedidos se les rehace el BOM", () => {
    it("los que todavía se están armando se rehacen", () => {
        for (const status of BOM_REFRESHABLE_STATUSES) {
            expect(bomRefreshDecision(pedido(status))).toEqual({ refresh: true, skip: null })
        }
    })

    it("un pedido retirado no se toca y no se reporta: su BOM es historia", () => {
        expect(bomRefreshDecision(pedido("retirado"))).toEqual({ refresh: false, skip: "cerrado" })
        expect(bomRefreshDecision(pedido("cancelado"))).toEqual({ refresh: false, skip: "cerrado" })
    })

    it("un pedido retirado que además descontó stock sigue siendo historia", () => {
        expect(bomRefreshDecision(pedido("retirado", true)).skip).toBe("cerrado")
    })

    it("si ya descontó stock queda para revisar a mano", () => {
        expect(bomRefreshDecision(pedido("en_proceso", true))).toEqual({ refresh: false, skip: "consumido" })
    })

    it("fabricado pero sin entregar tampoco se rehace", () => {
        expect(bomRefreshDecision(pedido("por_facturar")).skip).toBe("en_entrega")
        expect(bomRefreshDecision(pedido("listo_para_retirar")).skip).toBe("en_entrega")
    })

    it("todo estado conocido cae en alguna de las dos ramas", () => {
        for (const status of ORDER_STATUSES) {
            const d = bomRefreshDecision(pedido(status))
            expect(d.refresh ? d.skip === null : d.skip !== null).toBe(true)
        }
    })
})

describe("el aviso de lo que pasó con los pedidos", () => {
    const orden = (label: string) => ({ orderId: 1, label })

    it("sin pedidos en marcha no hay nada que avisar", () => {
        expect(bomRefreshMessage({ updated: [], pending: [] })).toBeNull()
    })

    it("cuenta los actualizados y los nombra", () => {
        const msg = bomRefreshMessage({ updated: [orden("PED-1"), orden("PED-2")], pending: [] })
        expect(msg?.title).toContain("2 pedidos")
        expect(msg?.description).toContain("PED-1, PED-2")
    })

    it("un solo pedido se cuenta en singular", () => {
        expect(bomRefreshMessage({ updated: [orden("PED-1")], pending: [] })?.title).toContain("1 pedido")
    })

    it("los que quedaron sin tocar se agrupan por motivo y piden revisión", () => {
        const msg = bomRefreshMessage({
            updated: [],
            pending: [
                { ...orden("PED-9"), reason: "consumido" },
                { ...orden("PED-8"), reason: "en_entrega" },
            ],
        })
        expect(msg?.title).toContain("Ningún pedido")
        expect(msg?.description).toContain("ya descontaron stock: PED-9")
        expect(msg?.description).toContain("ya están fabricados: PED-8")
        expect(msg?.description).toContain("a mano")
    })
})
