import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { AlegraError, getRemissionPdfUrl } from "@/lib/alegra"

// Imprimir un remito: redirige al PDF que arma Alegra.
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
    _request: NextRequest,
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
        SELECT alegra_remission_id FROM order_remissions
        WHERE id = ${remitoId} AND order_id = ${orderId}
    `
    const alegraId = (rows as any[])[0]?.alegra_remission_id
    if (!alegraId) {
        return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 })
    }

    try {
        const pdf = await getRemissionPdfUrl(Number(alegraId))
        if (!pdf) {
            return NextResponse.json({ error: "Alegra no devolvió el PDF del remito" }, { status: 502 })
        }
        return NextResponse.redirect(pdf)
    } catch (error) {
        const status = error instanceof AlegraError ? error.status : 500
        console.error("[remito pdf]", error)
        return NextResponse.json({ error: "No se pudo traer el PDF del remito" }, { status: status >= 500 ? 502 : status })
    }
}
