import { describe, expect, it } from "vitest"
import {
    bomFingerprint,
    bomRefreshDecision,
    bomRefreshLabel,
    bomRefreshMessage,
    planBomRefresh,
    BOM_REFRESHABLE_STATUSES,
    type BomFingerprintRow,
    type BomRefreshCandidate,
} from "@/lib/bom-refresh"
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

describe("el reparto de todos los pedidos que usan la ficha", () => {
    const candidato = (over: Partial<BomRefreshCandidate> = {}): BomRefreshCandidate => ({
        orderId: 1,
        externalId: "CRM-001",
        reference: null,
        status: "en_proceso",
        consumed: false,
        ...over,
    })

    it("separa los que se rehacen de los que hay que mirar a mano", () => {
        const plan = planBomRefresh([
            candidato({ orderId: 1, externalId: "CRM-001", status: "recibido" }),
            candidato({ orderId: 2, externalId: "CRM-002", status: "en_proceso", consumed: true }),
            candidato({ orderId: 3, externalId: "CRM-003", status: "listo_para_retirar" }),
            candidato({ orderId: 4, externalId: "CRM-004", status: "retirado" }),
        ])

        expect(plan.refresh).toEqual([{ orderId: 1, label: "CRM-001" }])
        expect(plan.pending).toEqual([
            { orderId: 2, label: "CRM-002", reason: "consumido" },
            { orderId: 3, label: "CRM-003", reason: "en_entrega" },
        ])
    })

    it("el pedido retirado no aparece en ninguna de las dos listas", () => {
        const plan = planBomRefresh([candidato({ status: "retirado" }), candidato({ status: "cancelado" })])
        expect(plan.refresh).toEqual([])
        expect(plan.pending).toEqual([])
    })

    it("sin pedidos, plan vacío", () => {
        expect(planBomRefresh([])).toEqual({ refresh: [], pending: [] })
    })

    it("nombra al pedido por su referencia cuando la tiene", () => {
        expect(bomRefreshLabel({ externalId: "CRM-001", reference: "PED-42" })).toBe("PED-42")
    })

    it("sin referencia usa el id del CRM, nunca el id interno", () => {
        expect(bomRefreshLabel({ externalId: "CRM-001", reference: null })).toBe("CRM-001")
        expect(bomRefreshLabel({ externalId: "CRM-001", reference: "   " })).toBe("CRM-001")
    })
})

describe("la huella de la receta", () => {
    const linea = (over: Partial<BomFingerprintRow> = {}): BomFingerprintRow => ({
        material_id: 10,
        label: "Tira LED",
        qty: 2,
        spec_field_key: null,
        family_id: null,
        options: [],
        ...over,
    })

    it("la misma receta da la misma huella aunque las líneas vengan en otro orden", () => {
        const a = [linea(), linea({ material_id: 20, label: "Fuente" })]
        const b = [linea({ material_id: 20, label: "Fuente" }), linea()]
        expect(bomFingerprint(a)).toBe(bomFingerprint(b))
    })

    it("los numeric como string son la misma cantidad que el número", () => {
        // El driver devuelve "2.00" donde antes devolvía 2: no es un cambio de receta.
        expect(bomFingerprint([linea({ qty: "2.00" })])).toBe(bomFingerprint([linea({ qty: 2 })]))
    })

    it("cambiar la cantidad cambia la huella", () => {
        expect(bomFingerprint([linea({ qty: 3 })])).not.toBe(bomFingerprint([linea({ qty: 2 })]))
    })

    it("cambiar el material cambia la huella", () => {
        expect(bomFingerprint([linea({ material_id: 11 })])).not.toBe(bomFingerprint([linea()]))
    })

    it("cambiar la etiqueta cambia la huella: es lo que lee el taller en el pedido", () => {
        expect(bomFingerprint([linea({ label: "Tira LED 24V" })])).not.toBe(bomFingerprint([linea()]))
    })

    it("agregar o sacar una línea cambia la huella", () => {
        expect(bomFingerprint([linea(), linea({ material_id: 20 })])).not.toBe(bomFingerprint([linea()]))
    })

    it("vincular la línea a una familia cambia la huella", () => {
        expect(bomFingerprint([linea({ family_id: 3 })])).not.toBe(bomFingerprint([linea()]))
    })

    it("empezar a variar por un campo de specs cambia la huella", () => {
        expect(bomFingerprint([linea({ spec_field_key: "led_color" })])).not.toBe(bomFingerprint([linea()]))
    })

    it("las variantes cuentan, y su orden no", () => {
        const calidoFrio = [
            linea({
                spec_field_key: "led_color",
                options: [
                    { v: "calido", m: 11, q: null },
                    { v: "frio", m: 12, q: null },
                ],
            }),
        ]
        const frioCalido = [
            linea({
                spec_field_key: "led_color",
                options: [
                    { v: "frio", m: 12, q: null },
                    { v: "calido", m: 11, q: null },
                ],
            }),
        ]
        expect(bomFingerprint(calidoFrio)).toBe(bomFingerprint(frioCalido))

        const otroMaterial = [
            linea({
                spec_field_key: "led_color",
                options: [
                    { v: "calido", m: 99, q: null },
                    { v: "frio", m: 12, q: null },
                ],
            }),
        ]
        expect(bomFingerprint(otroMaterial)).not.toBe(bomFingerprint(calidoFrio))
    })

    it("cambiar la cantidad de una variante cambia la huella", () => {
        const conDos = [linea({ spec_field_key: "clamp", options: [{ v: "larga", m: 11, q: 2 }] })]
        const conCuatro = [linea({ spec_field_key: "clamp", options: [{ v: "larga", m: 11, q: 4 }] })]
        expect(bomFingerprint(conDos)).not.toBe(bomFingerprint(conCuatro))
    })

    it("una variante en 0 no es lo mismo que una sin cantidad propia", () => {
        // 0 = 'con esta opción la línea no va'; null = 'la cantidad de la línea'.
        const cero = [linea({ spec_field_key: "clamp", options: [{ v: "larga", m: 11, q: 0 }] })]
        const sinQty = [linea({ spec_field_key: "clamp", options: [{ v: "larga", m: 11, q: null }] })]
        expect(bomFingerprint(cero)).not.toBe(bomFingerprint(sinQty))
    })

    it("una ficha sin materiales tiene huella estable", () => {
        expect(bomFingerprint([])).toBe(bomFingerprint([]))
    })
})
