import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { isAlegraConfigured } from "@/lib/alegra"
import { invoiceOrder, previewInvoice } from "@/lib/invoicing"

// Facturar un pedido en Alegra.
//
// GET  -> SIMULACIÓN. Devuelve exactamente qué líneas saldrían, con qué ítem y a
//         qué precio, sin tocar Alegra. Es la forma de probar contra pedidos
//         reales sin emitir nada en la contabilidad.
// POST -> EMITE de verdad. Solo admin.
//
// Emitir una factura es irreversible del lado de Alegra (se anula, no se borra),
// así que el permiso es de admin y no de cualquier usuario con sesión.

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    // ADMIN o INTERNAL_SECRET. La simulación no escribe nada, pero devuelve
    // PRECIOS, y el módulo de pedidos es deliberadamente sin plata: el operador
    // del taller no ve importes en ninguna pantalla. Sin este chequeo, alcanzaba
    // con pedir la URL a mano para saltear eso.
    // El secreto queda para poder verificar desde un script.
    const session = await auth()
    const conSecreto = requireInternalSecret(request) === null
    if (session?.user?.role !== "admin" && !conSecreto) {
        return NextResponse.json({ error: "Solo un admin puede ver la factura" }, { status: 403 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    try {
        return NextResponse.json({ dry_run: true, ...(await previewInvoice(orderId)) })
    } catch (error) {
        console.error("Error simulando factura:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
    }
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    if (session?.user?.role !== "admin") {
        return NextResponse.json({ error: "Solo un admin puede facturar" }, { status: 403 })
    }
    if (!isAlegraConfigured()) {
        return NextResponse.json({ error: "Alegra no está configurado" }, { status: 503 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    try {
        return NextResponse.json(await invoiceOrder(orderId))
    } catch (error) {
        console.error("Error facturando:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 502 })
    }
}
