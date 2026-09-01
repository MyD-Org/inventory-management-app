import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { logOrderEvent } from "@/lib/order-events"
import { isAlegraConfigured } from "@/lib/alegra"
import { linkExistingInvoice, previewInvoiceLink, unlinkInvoice } from "@/lib/invoicing"

// Apuntar el pedido a una factura que YA estaba en Alegra.
//
// GET    ?ref=... -> BUSCA y devuelve qué factura es, sin guardar nada.
// POST   { ref }  -> la vincula al pedido.
// DELETE          -> la suelta. No borra nada en Alegra.
//
// NO EMITE Y NO MODIFICA la factura: solo guarda a cuál apunta el pedido. La
// factura se hizo antes y con su propio criterio.
//
// Los IMPORTES son del admin, igual que en la simulación de facturar: acá el total
// se recorta para el resto del taller. El número, el cliente y la fecha sí se
// muestran a todos — son lo que hace falta para saber si es la factura correcta.

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
    if (!ref.trim()) return NextResponse.json({ error: "Falta el número o la URL de la factura" }, { status: 400 })

    try {
        const invoice = await previewInvoiceLink(orderId, ref)
        const veImportes = session.user.role === "admin"
        return NextResponse.json(veImportes ? invoice : { ...invoice, total: null, sin_importes: true })
    } catch (error) {
        // El mensaje se pasa tal cual: "no se encontró, pegá la URL" le dice a
        // alguien qué hacer, y un 404 pelado no.
        console.error("Error buscando la factura:", error)
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
    if (!ref.trim()) return NextResponse.json({ error: "Falta el número o la URL de la factura" }, { status: 400 })

    try {
        const invoice = await linkExistingInvoice(orderId, ref)
        // Queda en la historia como un evento distinto de "se emitió": la factura
        // ya existía y alguien decidió que era esta.
        await logOrderEvent(orderId, {
            kind: "invoice",
            field: "vinculada",
            newValue: invoice.number ?? String(invoice.id),
        })
        return NextResponse.json(invoice)
    } catch (error) {
        console.error("Error vinculando la factura:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 400 })
    }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    try {
        await unlinkInvoice(orderId)
        await logOrderEvent(orderId, { kind: "invoice", field: "desvinculada", newValue: null })
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error("Error desvinculando la factura:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
    }
}
