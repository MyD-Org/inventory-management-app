import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { isAlegraConfigured } from "@/lib/alegra"
import { currentActor, logOrderEvent } from "@/lib/order-events"
import { previewRemission, previewRemissionUpdate, remitOrder, updateOrderRemission } from "@/lib/remissions"
import { describeDelivery, type DeliveryRequestItem } from "@/lib/deliveries"

// Emitir un remito de un pedido en Alegra.
//
// GET  -> SIMULACIÓN. Qué diría el remito si se emitiera ahora, sin tocar Alegra.
//         Acepta ?items=1:4,2:3 para simular una entrega parcial, y
//         ?modo=actualizar para simular la corrección del último remito emitido.
// POST -> EMITE de verdad. Con body { items: [{ orderItemId, quantity }] } entrega
//         solo eso; sin body entrega todo lo que quede pendiente.
// PUT  -> ACTUALIZA el ÚLTIMO remito emitido, cuando el pedido cambió después.
//         Edita el mismo remito: no emite otro ni cambia el número.
//
// UN PEDIDO PUEDE TENER VARIOS REMITOS: la mercadería sale por partes y cada
// salida es un papel propio. POST dos veces no duplica la entrega —lo que frena es
// el pendiente, que después de la primera es menor— y sobre un pedido ya entregado
// por completo falla.
//
// SIN RECORTE DE IMPORTES, a diferencia de facturar: el remito va en cero, no hay
// plata que ocultarle a nadie. Por eso tampoco hay chequeo de rol acá.
//
// Es independiente de la factura y en cualquier orden: el pedido puede tener uno,
// el otro, los dos o ninguno.

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * "1:4,2:3" -> entregar 4 de la línea 1 y 3 de la línea 2. Va por querystring
 * porque el GET es una simulación y tiene que poder pedirse desde la barra del
 * navegador. Sin el parámetro devuelve null, que es "todo lo pendiente".
 */
function parseItemsParam(request: NextRequest): DeliveryRequestItem[] | null {
    const raw = request.nextUrl.searchParams.get("items")
    if (!raw) return null
    const items = raw
        .split(",")
        .map((par) => par.split(":").map(Number))
        .filter(([id, qty]) => Number.isFinite(id) && Number.isFinite(qty))
        .map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
    return items.length > 0 ? items : null
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    const conSecreto = requireInternalSecret(request) === null
    if (!session?.user && !conSecreto) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    try {
        // Actualizar no entrega nada nuevo: recalcula lo que el último remito ya
        // dice. Por eso es otra simulación y no esta con otras cantidades.
        if (request.nextUrl.searchParams.get("modo") === "actualizar") {
            return NextResponse.json(await previewRemissionUpdate(orderId))
        }
        return NextResponse.json(await previewRemission(orderId, parseItemsParam(request)))
    } catch (error) {
        console.error("Error simulando remito:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
    }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    if (!session?.user) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    if (!isAlegraConfigured()) {
        return NextResponse.json({ error: "Alegra no está configurado" }, { status: 503 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    // Sin body se entrega todo lo pendiente: es el caso normal, el pedido sale
    // completo. El body está para la entrega parcial, donde alguien eligió cuánto
    // sale de cada línea.
    let items: DeliveryRequestItem[] | null = null
    try {
        const body = await request.json()
        if (Array.isArray(body?.items)) {
            items = body.items.map((i: any) => ({
                orderItemId: Number(i.orderItemId),
                quantity: Number(i.quantity),
            }))
        }
    } catch {
        items = null
    }

    try {
        const actor = await currentActor()
        const resultado = await remitOrder(orderId, items, actor)
        // Igual que la factura: es de lo primero que se busca en la historia
        // cuando hay que reconstruir qué salió del depósito y cuándo. Y con
        // entregas parciales importa MÁS: el número del remito solo no dice cuánto
        // salió, así que el evento lo cuenta.
        if (resultado.remissionId != null) {
            await logOrderEvent(orderId, {
                kind: "invoice",
                field: "remito",
                newValue: resultado.remissionNumber ?? String(resultado.remissionId),
                body: describeDelivery(
                    resultado.delivery.map((d) => ({
                        id: d.orderItemId,
                        product: d.product,
                        quantity: d.ordered,
                        delivered: d.delivered,
                    })),
                ),
            })
        }
        return NextResponse.json(resultado)
    } catch (error) {
        console.error("Error emitiendo remito:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 502 })
    }
}

// Poner al día el remito de un pedido que se modificó después de emitirse.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    if (!session?.user) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    if (!isAlegraConfigured()) {
        return NextResponse.json({ error: "Alegra no está configurado" }, { status: 503 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    try {
        const resultado = await updateOrderRemission(orderId)
        await logOrderEvent(orderId, {
            kind: "invoice",
            field: "remito actualizado",
            newValue: resultado.remissionNumber ?? String(resultado.remissionId),
        })
        return NextResponse.json(resultado)
    } catch (error) {
        console.error("Error actualizando remito:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 502 })
    }
}
