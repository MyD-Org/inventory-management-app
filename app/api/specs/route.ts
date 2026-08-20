import { type NextRequest, NextResponse } from "next/server"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { getSpecs } from "@/lib/orders"

// Vocabulario de opciones válidas para armar un pedido (§3 del doc del CRM).
// El agente lo consulta antes de preguntarle al cliente, así no inventa valores.
// El equipo de inventario es dueño del vocabulario: agrega/desactiva opciones en
// spec_fields/spec_options y el bot las descubre solo, sin tocar código del CRM.
//
// Formato:  { "clamp": { "label": "Grampa", "options": ["larga", "corta"] } }
export async function GET(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    try {
        return NextResponse.json(await getSpecs())
    } catch (error) {
        console.error("Error in /api/specs:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
