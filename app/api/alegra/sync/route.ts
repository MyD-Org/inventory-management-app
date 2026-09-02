import { type NextRequest, NextResponse } from "next/server"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { isAlegraConfigured } from "@/lib/alegra"
import { syncContacts, syncInvoices, syncItems, syncPayments, syncReceivables } from "@/lib/alegra-sync"

// Refresca el espejo de Alegra desde la API. Pensado para un cron (Vercel Cron o
// el que sea) y para poder dispararlo a mano cuando hace falta.
//
// Autenticado con INTERNAL_SECRET, igual que las tools de IA: no lo llama un
// navegador con sesión, lo llama un proceso.
//
// POST y no GET porque escribe.
//
// ?only=contacts|items|invoices|payments|receivables
//                                   limita la corrida a una parte (para probar,
//                                   o para correr contactos más seguido que el resto).
// ?since=YYYY-MM-DD                 pisa el cursor incremental. Sin esto, arranca
//                                   desde la fecha más nueva del espejo menos 7
//                                   días de margen; con el espejo vacío hace
//                                   backfill completo.
//
// NO cubre notas de crédito ni de débito: están en otro endpoint de Alegra y
// siguen viniendo del import CSV.

export const dynamic = "force-dynamic"
// El sync de productos son ~57 páginas de la API a ~1s cada una: 67s medidos.
// 60 no alcanza.
export const maxDuration = 300

export async function POST(request: NextRequest) {
    const unauthorized = requireInternalSecret(request)
    if (unauthorized) return unauthorized

    if (!isAlegraConfigured()) {
        return NextResponse.json(
            { error: "Alegra no está configurado (faltan ALEGRA_EMAIL / ALEGRA_TOKEN)" },
            { status: 503 },
        )
    }

    const { searchParams } = new URL(request.url)
    const only = searchParams.get("only")
    const since = searchParams.get("since") || undefined
    const run = (part: string) => !only || only === part

    const startedAt = Date.now()
    try {
        // El orden importa: los contactos primero, porque las facturas y los pagos
        // se vinculan al cliente por alegra_id contra la tabla ya actualizada.
        const contacts = run("contacts") ? await syncContacts() : null
        // Los productos son el catálogo: un pedido resuelve contra esto.
        const items = run("items") ? await syncItems() : null
        const invoices = run("invoices") ? await syncInvoices(since) : null
        const payments = run("payments") ? await syncPayments(since) : null
        // Último: reemplaza la foto de cuentas por cobrar y refresca la MV de
        // balances, que agrega sobre los contactos ya actualizados arriba.
        const receivables = run("receivables") ? await syncReceivables() : null

        return NextResponse.json({
            ok: true,
            contacts,
            items,
            invoices,
            payments,
            receivables,
            duration_ms: Date.now() - startedAt,
        })
    } catch (error) {
        console.error("Error en /api/alegra/sync:", error)
        // El mensaje de Alegra importa: un 402 acá significa que el plan dejó de
        // habilitar el endpoint, y es lo primero que hay que mirar.
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Error sincronizando" },
            { status: 502 },
        )
    }
}
