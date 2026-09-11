import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { isAlegraConfigured } from "@/lib/alegra"
import { currentActor, logOrderEvent } from "@/lib/order-events"
import { linkExistingRemission, previewRemissionLink, unlinkRemission } from "@/lib/remissions"
import { describeDelivery, type DeliveryRequestItem } from "@/lib/deliveries"

// Apuntar el pedido a un remito que YA estaba en Alegra.
//
// GET  ?ref=...                -> BUSCA y devuelve qué remito es y qué falta remitir.
// POST { ref, items? }         -> lo vincula cubriendo esas cantidades; sin items,
//                                 todo lo pendiente.
//
// NO EMITE Y NO MODIFICA el remito: solo lo anota en el pedido, con las cantidades
// que quien vincula dice que nombra. Ver linkExistingRemission.

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    if (!isAlegraConfigured()) {
        return NextResponse.json({ error: "Alegra no está configurado" }, { status: 503 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    const ref = request.nextUrl.searchParams.get("ref") ?? ""
    if (!ref.trim()) return NextResponse.json({ error: "Falta la URL del remito" }, { status: 400 })

    try {
        return NextResponse.json(await previewRemissionLink(orderId, ref))
    } catch (error) {
        console.error("Error buscando el remito:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 404 })
    }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    if (!isAlegraConfigured()) {
        return NextResponse.json({ error: "Alegra no está configurado" }, { status: 503 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    let body: Record<string, unknown> = {}
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }
    const ref = typeof body.ref === "string" ? body.ref : ""
    if (!ref.trim()) return NextResponse.json({ error: "Falta la URL del remito" }, { status: 400 })

    const items: DeliveryRequestItem[] | null = Array.isArray(body.items)
        ? body.items.map((i: any) => ({ orderItemId: Number(i.orderItemId), quantity: Number(i.quantity) }))
        : null

    try {
        const actor = await currentActor()
        const remission = await linkExistingRemission(orderId, ref, items, actor)
        // Mismo evento que un remito emitido desde acá, dicho como vinculado: el
        // papel ya existía y alguien decidió que era de este pedido.
        await logOrderEvent(orderId, {
            kind: "invoice",
            field: "remito",
            newValue: remission.number ?? String(remission.id),
            body: `Vinculado desde Alegra · ${describeDelivery(
                remission.delivery.map((d) => ({
                    id: d.orderItemId,
                    product: d.product,
                    quantity: d.ordered,
                    delivered: d.delivered,
                })),
            )}`,
        })
        return NextResponse.json(remission)
    } catch (error) {
        console.error("Error vinculando el remito:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 400 })
    }
}

// DELETE ?remissionId=N -> suelta ese remito del pedido (N es el id de
// order_remissions, no el de Alegra). No anula nada en Alegra. Solo admin: sus
// unidades vuelven a pendientes y eso cambia qué se carga en la camioneta.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    if (session.user.role !== "admin") return NextResponse.json({ error: "Solo un admin" }, { status: 403 })

    const orderId = Number.parseInt(params.id, 10)
    const remissionId = Number.parseInt(request.nextUrl.searchParams.get("remissionId") ?? "", 10)
    if (!Number.isFinite(orderId) || !Number.isFinite(remissionId)) {
        return NextResponse.json({ error: "Pedido o remito inválido" }, { status: 400 })
    }

    try {
        const { number, delivery } = await unlinkRemission(orderId, remissionId)
        await logOrderEvent(orderId, {
            kind: "invoice",
            field: "remito desvinculado",
            newValue: number,
            body: describeDelivery(
                delivery.map((d) => ({
                    id: d.orderItemId,
                    product: d.product,
                    quantity: d.ordered,
                    delivered: d.delivered,
                })),
            ),
        })
        return NextResponse.json({ ok: true, number })
    } catch (error) {
        console.error("Error desvinculando el remito:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 400 })
    }
}
