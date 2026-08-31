import { NextResponse, type NextRequest } from "next/server"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { listSpecChoices } from "@/lib/spec-choices"

// Tool de IA (read-only): devuelve los campos de especificación disponibles para
// armar familias de materiales (led_color, optica, etc.) con sus opciones.
export async function GET(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    try {
        const fields = await listSpecChoices()
        return NextResponse.json({ count: fields.length, fields })
    } catch (error) {
        console.error("Error in ai-tools/spec-fields:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
