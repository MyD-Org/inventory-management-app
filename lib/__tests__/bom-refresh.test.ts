import { describe, expect, it } from "vitest"
import {
    bomFingerprint,
    bomRefreshDecision,
    bomRefreshLabel,
    bomRefreshMessage,
    isReportableSkip,
    planBomRefresh,
    sameOrderBom,
    BOM_REFRESHABLE_STATUSES,
    type BomFingerprintRow,
    type BomRefreshCandidate,
    type OrderBomLine,
} from "@/lib/bom-refresh"
import { ORDER_STATUSES } from "@/lib/order-statuses"

const pedido = (status: string, consumed = false) => ({ status, consumed })

describe("a qué pedidos se les rehace el BOM", () => {
    it("los que todavía se están armando se rehacen", () => {
        for (const status of BOM_REFRESHABLE_STATUSES) {
            expect(bomRefreshDecision(pedido(status))).toEqual({ refresh: true, skip: null, checkConsumption: false })
        }
    })

    it("un pedido retirado no se toca y no se reporta: su BOM es historia", () => {
        expect(bomRefreshDecision(pedido("retirado")).skip).toBe("cerrado")
        expect(bomRefreshDecision(pedido("cancelado")).skip).toBe("cerrado")
    })

    it("un pedido retirado que además descontó stock sigue siendo historia", () => {
        expect(bomRefreshDecision(pedido("retirado", true)).skip).toBe("cerrado")
    })

    it("haber descontado stock no frena el recálculo, pero lo marca para revisar", () => {
        // El descuento es material por material: frenar el pedido entero dejaba
        // sin corregir las líneas que nadie fue a buscar todavía.
        expect(bomRefreshDecision(pedido("en_proceso", true))).toEqual({
            refresh: true,
            skip: null,
            checkConsumption: true,
        })
    })

    it("sin descuentos no hay nada que revisar", () => {
        expect(bomRefreshDecision(pedido("en_proceso")).checkConsumption).toBe(false)
    })

    it("preparando entrega no se rehace, y se avisa: el pedido sigue en movimiento", () => {
        const d = bomRefreshDecision(pedido("por_facturar"))
        expect(d.skip).toBe("en_entrega")
        expect(isReportableSkip(d.skip!)).toBe(true)
    })

    it("listo para retirar no se rehace y NO se avisa: ya está armado", () => {
        const d = bomRefreshDecision(pedido("listo_para_retirar"))
        expect(d.refresh).toBe(false)
        expect(d.skip).toBe("listo")
        expect(isReportableSkip(d.skip!)).toBe(false)
    })

    it("listo para retirar con stock descontado sigue siendo silencioso", () => {
        const d = bomRefreshDecision(pedido("listo_para_retirar", true))
        expect(d.skip).toBe("listo")
        expect(d.checkConsumption).toBe(false)
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

    const vacio = { updated: [], checkConsumption: [], pending: [] }

    it("sin pedidos en marcha no hay nada que avisar", () => {
        expect(bomRefreshMessage(vacio)).toBeNull()
    })

    it("cuenta los actualizados y los nombra", () => {
        const msg = bomRefreshMessage({ ...vacio, updated: [orden("PED-1"), orden("PED-2")] })
        expect(msg?.title).toContain("2 pedidos")
        expect(msg?.description).toContain("PED-1, PED-2")
    })

    it("un solo pedido se cuenta en singular", () => {
        expect(bomRefreshMessage({ ...vacio, updated: [orden("PED-1")] })?.title).toContain("1 pedido")
    })

    it("el que se actualizó con stock ya descontado pide que se lo revise", () => {
        const msg = bomRefreshMessage({
            ...vacio,
            updated: [orden("PED-1"), orden("PED-9")],
            checkConsumption: [orden("PED-9")],
        })
        expect(msg?.title).toContain("2 pedidos")
        expect(msg?.description).toContain("PED-9 ya había descontado stock")
        expect(msg?.description).toContain("revisá")
    })

    it("los que quedaron sin tocar se agrupan por motivo y piden revisión", () => {
        const msg = bomRefreshMessage({ ...vacio, pending: [{ ...orden("PED-8"), reason: "en_entrega" }] })
        expect(msg?.title).toContain("Ningún pedido")
        expect(msg?.description).toContain("están preparando la entrega: PED-8")
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
            candidato({ orderId: 3, externalId: "CRM-003", status: "por_facturar" }),
            candidato({ orderId: 4, externalId: "CRM-004", status: "retirado" }),
            candidato({ orderId: 5, externalId: "CRM-005", status: "listo_para_retirar" }),
        ])

        expect(plan.refresh).toEqual([
            { orderId: 1, label: "CRM-001", checkConsumption: false },
            { orderId: 2, label: "CRM-002", checkConsumption: true },
        ])
        expect(plan.pending).toEqual([{ orderId: 3, label: "CRM-003", reason: "en_entrega" }])
    })

    it("el retirado, el cancelado y el listo para retirar no aparecen en ninguna lista", () => {
        const plan = planBomRefresh([
            candidato({ status: "retirado" }),
            candidato({ status: "cancelado" }),
            candidato({ status: "listo_para_retirar" }),
        ])
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

describe("¿la lista del pedido quedó vieja?", () => {
    const linea = (over: Partial<OrderBomLine> = {}): OrderBomLine => ({
        materialId: 10,
        label: "Tira LED cálida",
        qtyPerUnit: 0.6,
        qtyTotal: 1.2,
        familyId: null,
        specValue: null,
        ...over,
    })
    const bom = (lines: OrderBomLine[], unmapped: string[] = []) => ({ lines, unmapped })

    it("la misma lista en distinto orden es la misma lista", () => {
        const a = bom([linea(), linea({ materialId: 20, label: "Fuente" })])
        const b = bom([linea({ materialId: 20, label: "Fuente" }), linea()])
        expect(sameOrderBom(a, b)).toBe(true)
    })

    it("los numeric como string son la misma cantidad", () => {
        // order_item_materials es numeric: el driver devuelve "0.6000" y "1.2000".
        const guardado = bom([linea({ qtyPerUnit: "0.6000", qtyTotal: "1.2000" })])
        expect(sameOrderBom(guardado, bom([linea()]))).toBe(true)
    })

    it("cambiar la cantidad de la receta la deja vieja", () => {
        expect(sameOrderBom(bom([linea()]), bom([linea({ qtyPerUnit: 1.2, qtyTotal: 2.4 })]))).toBe(false)
    })

    it("un material nuevo en la receta deja vieja la lista", () => {
        const hoy = bom([linea(), linea({ materialId: 99, label: "Alto impacto" })])
        expect(sameOrderBom(bom([linea()]), hoy)).toBe(false)
    })

    it("un material que se sacó de la receta deja vieja la lista", () => {
        expect(sameOrderBom(bom([linea(), linea({ materialId: 99 })]), bom([linea()]))).toBe(false)
    })

    it("cambiar el material de una variante de familia deja vieja la lista", () => {
        const antes = bom([linea({ materialId: 10, familyId: 3, specValue: "calido" })])
        const hoy = bom([linea({ materialId: 11, familyId: 3, specValue: "calido" })])
        expect(sameOrderBom(antes, hoy)).toBe(false)
    })

    it("un aviso de variante sin resolver que ya no corresponde deja vieja la lista", () => {
        // Mismos materiales, pero el pedido arrastra un "no existe la variante"
        // de cuando la spec decía otra cosa.
        expect(sameOrderBom(bom([linea()], ["optic=30"]), bom([linea()], []))).toBe(false)
    })

    it("un aviso nuevo también la deja vieja", () => {
        expect(sameOrderBom(bom([linea()], []), bom([linea()], ["equipment_color=aluminio"]))).toBe(false)
    })

    it("el orden de los avisos no importa", () => {
        const a = bom([linea()], ["optic=30", "clamp=larga"])
        const b = bom([linea()], ["clamp=larga", "optic=30"])
        expect(sameOrderBom(a, b)).toBe(true)
    })

    it("dos listas vacías son iguales: sin receta no hay nada que rehacer", () => {
        expect(sameOrderBom(bom([]), bom([]))).toBe(true)
    })
})
