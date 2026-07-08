import { neon } from "@neondatabase/serverless"
import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

const sql = neon(process.env.DATABASE_URL!)

// Busca un cálculo de costo (budget) por nombre exacto (case-insensitive).
// Lo usa el asistente al aplicar un borrador: si ya existe un producto con ese
// nombre, abrimos el existente y le agregamos las líneas en vez de crear uno nuevo.
export async function GET(request: NextRequest) {
    const session = await auth()
    if (!session?.user) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const name = (new URL(request.url).searchParams.get("name") ?? "").trim()
    if (!name) return NextResponse.json({ id: null })

    try {
        const rows = await sql`
            SELECT id FROM budgets WHERE lower(name) = lower(${name}) ORDER BY id DESC LIMIT 1
        `
        return NextResponse.json({ id: rows[0]?.id ?? null })
    } catch (error) {
        console.error("Error en /api/budgets/find:", error)
        return NextResponse.json({ id: null })
    }
}
