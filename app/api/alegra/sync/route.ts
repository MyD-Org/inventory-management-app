import { type NextRequest, NextResponse } from "next/server"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { isAlegraConfigured } from "@/lib/alegra"
import { syncContacts } from "@/lib/alegra-sync"

// Refresca el espejo de Alegra desde la API. Pensado para un cron (Vercel Cron o
// el que sea) y para poder dispararlo a mano cuando hace falta.
//
// Autenticado con INTERNAL_SECRET, igual que las tools de IA: no lo llama un
// navegador con sesión, lo llama un proceso.
//
// POST y no GET porque escribe. De momento solo contactos; facturas y pagos
// siguen viniendo del import CSV hasta que este enfoque esté rodado.

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
    const unauthorized = requireInternalSecret(request)
    if (unauthorized) return unauthorized

    if (!isAlegraConfigured()) {
        return NextResponse.json(
            { error: "Alegra no está configurado (faltan ALEGRA_EMAIL / ALEGRA_TOKEN)" },
            { status: 503 },
        )
    }

    const startedAt = Date.now()
    try {
        const contacts = await syncContacts()
        return NextResponse.json({
            ok: true,
            contacts,
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
