import { type NextRequest, NextResponse } from "next/server"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { getSpecs } from "@/lib/orders"

// Vocabulario de opciones válidas para armar un pedido (§3 del doc del CRM).
// Devuelve SOLO las variaciones que se le ofrecen al cliente: las internas quedan
// afuera (se apagan con el interruptor de cada campo en /settings/variaciones).
// El agente lo consulta antes de preguntarle al cliente, así no inventa valores.
// El equipo de inventario es dueño del vocabulario: agrega/desactiva opciones en
// spec_fields/spec_options desde Configuración → Variaciones de producto
// (/settings/variaciones) y el bot las descubre solo, sin tocar código del CRM.
//
// Formato:  { "clamp": { "label": "Grampa", "options": ["larga", "corta"] } }
export async function GET(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    try {
        // Solo lo que el cliente elige: las variaciones internas las define el
        // taller y el bot no tiene por qué preguntarlas.
        const specs = await getSpecs({ soloCliente: true })
        return NextResponse.json(
            Object.fromEntries(
                Object.entries(specs).map(([key, f]) => [
                    key,
                    // Los nombres actuales, no las claves: si se renombra una opción
                    // el bot la ofrece con el nombre nuevo. Al crear o editar un
                    // pedido se acepta el nombre y se guarda la clave.
                    { label: f.label, options: f.options.map((o) => f.labels[o] ?? o), free_text: f.free_text, kind: f.kind },
                ]),
            ),
        )
    } catch (error) {
        console.error("Error in /api/specs:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
