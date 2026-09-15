import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { getInvoicePdfUrl } from "@/lib/alegra"
import { proxyAlegraPdf } from "@/lib/document-pdf"

// El PDF de la factura del pedido, para verlo en el modal. `?download=1` lo baja.
//
// SOLO ADMIN, con el mismo criterio que el link a Alegra: el resto ve el número
// de la factura y nada más. El remito, en cambio, es de todos (ver su ruta).
//
// El id de Alegra sale del pedido y no de la URL: no hay forma de pedir por acá
// una factura que no sea la de este pedido.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await auth()
    if (!session?.user) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    if (session.user.role !== "admin") {
        return NextResponse.json({ error: "Solo un administrador puede ver la factura" }, { status: 403 })
    }

    const orderId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(orderId)) {
        return NextResponse.json({ error: "Id inválido" }, { status: 400 })
    }

    const rows = await sql`SELECT alegra_invoice_id, alegra_invoice_number FROM orders WHERE id = ${orderId}`
    const row = (rows as any[])[0]
    if (!row?.alegra_invoice_id) {
        return NextResponse.json({ error: "El pedido no tiene factura" }, { status: 404 })
    }

    return proxyAlegraPdf(
        () => getInvoicePdfUrl(Number(row.alegra_invoice_id)),
        `factura-${row.alegra_invoice_number ?? row.alegra_invoice_id}`,
        request.nextUrl.searchParams.get("download") === "1",
    )
}
