import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { logOrderEvent } from "@/lib/order-events"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { isAlegraConfigured } from "@/lib/alegra"
import { invoiceOrder, previewInvoice, updateOrderInvoice } from "@/lib/invoicing"

// Facturar un pedido en Alegra.
//
// GET  -> SIMULACIÓN. Devuelve exactamente qué líneas saldrían, con qué ítem y a
//         qué precio, sin tocar Alegra. Es la forma de probar contra pedidos
//         reales sin emitir nada en la contabilidad.
// POST -> EMITE de verdad. Solo admin.
// PUT  -> ACTUALIZA la factura ya emitida, cuando el pedido cambió después. Edita
//         la misma factura de Alegra: no emite una segunda ni cambia el número.
//
// Emitir una factura es irreversible del lado de Alegra (se anula, no se borra),
// así que el permiso es de admin y no de cualquier usuario con sesión.

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    // Facturar lo puede hacer cualquiera del taller, pero los IMPORTES son solo
    // del admin: el módulo de pedidos es deliberadamente sin plata. Entonces la
    // simulación se abre a todos y los precios se recortan más abajo, en vez de
    // negar la pantalla entera.
    // El secreto queda para poder verificar desde un script.
    const session = await auth()
    const conSecreto = requireInternalSecret(request) === null
    if (!session?.user && !conSecreto) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const veImportes = session?.user?.role === "admin" || conSecreto

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    try {
        const preview = await previewInvoice(orderId)
        if (!veImportes) {
            // Los importes se sacan ACÁ y no se ocultan en el front: si viajan al
            // navegador, alcanza con abrir la consola para verlos.
            return NextResponse.json({
                dry_run: true,
                ...preview,
                sin_importes: true,
                total: null,
                lines: preview.lines.map(({ price, ...resto }) => resto),
            })
        }
        return NextResponse.json({ dry_run: true, ...preview })
    } catch (error) {
        console.error("Error simulando factura:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
    }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    // Emitir lo puede hacer cualquiera del taller: mover el pedido a "Por facturar"
    // ya dispara la factura automática, así que restringir el botón manual solo
    // dejaba trabado el reintento cuando esa falla.
    const session = await auth()
    if (!session?.user) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    if (!isAlegraConfigured()) {
        return NextResponse.json({ error: "Alegra no está configurado" }, { status: 503 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

    let body: Record<string, unknown> = {}
    try {
        body = await request.json()
    } catch {
        // body vacío es válido: se usan los valores guardados en el pedido.
    }

    try {
        const resultado = await invoiceOrder(orderId, {
            terms: typeof body.terms === "string" ? body.terms : undefined,
            notes: typeof body.notes === "string" ? body.notes : undefined,
        })
        // Emitir es irreversible del lado de Alegra: es de lo primero que se va a
        // buscar en la historia cuando algo salga mal.
        if (resultado.invoiceId != null) {
            await logOrderEvent(orderId, {
                kind: "invoice",
                newValue: resultado.invoiceNumber ?? String(resultado.invoiceId),
            })
        }
        return NextResponse.json(resultado)
    } catch (error) {
        console.error("Error facturando:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 502 })
    }
}


// Poner al día la factura de un pedido que se modificó después de emitirse.
//
// El permiso es el mismo que para emitir: si alguien del taller puede corregir el
// pedido, tiene que poder dejar la factura acorde. Lo contrario —poder desalinearla
// pero no arreglarla— es peor que las dos opciones.
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
        const resultado = await updateOrderInvoice(orderId)
        await logOrderEvent(orderId, {
            kind: "invoice",
            field: "actualizada",
            newValue: resultado.invoiceNumber ?? String(resultado.invoiceId),
        })
        return NextResponse.json(resultado)
    } catch (error) {
        // El mensaje de Alegra se pasa tal cual: "Se ha excedido la cantidad
        // disponible" le dice al taller qué hacer; "Error 400" no.
        console.error("Error actualizando factura:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 502 })
    }
}
