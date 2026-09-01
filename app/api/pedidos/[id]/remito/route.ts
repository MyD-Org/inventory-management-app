import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { logOrderEvent } from "@/lib/order-events"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { isAlegraConfigured } from "@/lib/alegra"
import { previewRemission, remitOrder } from "@/lib/remissions"

// Emitir el remito de un pedido en Alegra.
//
// GET  -> SIMULACIÓN. Qué diría el remito si se emitiera ahora, sin tocar Alegra.
// POST -> EMITE de verdad.
//
// SIN RECORTE DE IMPORTES, a diferencia de facturar: el remito va en cero, no hay
// plata que ocultarle a nadie. Por eso tampoco hay chequeo de rol acá.
//
// Es independiente de la factura y en cualquier orden: el pedido puede tener uno,
// el otro, los dos o ninguno.

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    const conSecreto = requireInternalSecret(request) === null
    if (!session?.user && !conSecreto) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    try {
        return NextResponse.json(await previewRemission(orderId))
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

    try {
        const resultado = await remitOrder(orderId)
        // Igual que la factura: es de lo primero que se busca en la historia
        // cuando hay que reconstruir qué salió del depósito y cuándo.
        if (resultado.remissionId != null) {
            await logOrderEvent(orderId, {
                kind: "invoice",
                field: "remito",
                newValue: resultado.remissionNumber ?? String(resultado.remissionId),
            })
        }
        return NextResponse.json(resultado)
    } catch (error) {
        console.error("Error emitiendo remito:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 502 })
    }
}
