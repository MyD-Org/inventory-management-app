import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { getRemissionPdfUrl } from "@/lib/alegra"
import { proxyAlegraPdf } from "@/lib/document-pdf"

// El PDF de un remito, para verlo en el modal o imprimirlo. `?download=1` lo baja.
//
// ES PARA TODOS, admin o no: el taller y el mostrador son los que entregan la
// mercadería con el papel en la mano. No les abre Alegra —el PDF es un archivo
// suelto, no una sesión en la contabilidad—, así que no choca con que el link al
// remito sea solo del admin.
//
// VA FUERA DE /api A PROPÓSITO: /api queda afuera del middleware y sus rutas se
// autentican con el secreto interno del CRM. Esta la usa una persona logueada.
//
// EL REMITO TIENE QUE SER DE ESTE PEDIDO: el id de la URL es el nuestro
// (order_remissions), no el de Alegra, y se busca junto con el pedido. Cambiar el
// número en la barra no alcanza para abrir el remito de otro cliente.
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string; remitoId: string } },
) {
    const session = await auth()
    if (!session?.user) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const orderId = Number.parseInt(params.id, 10)
    const remitoId = Number.parseInt(params.remitoId, 10)
    if (!Number.isFinite(orderId) || !Number.isFinite(remitoId)) {
        return NextResponse.json({ error: "Id inválido" }, { status: 400 })
    }

    const rows = await sql`
        SELECT alegra_remission_id, alegra_remission_number FROM order_remissions
        WHERE id = ${remitoId} AND order_id = ${orderId}
    `
    const row = (rows as any[])[0]
    if (!row?.alegra_remission_id) {
        return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 })
    }

    return proxyAlegraPdf(
        () => getRemissionPdfUrl(Number(row.alegra_remission_id)),
        `remito-${row.alegra_remission_number ?? row.alegra_remission_id}`,
        request.nextUrl.searchParams.get("download") === "1",
    )
}
