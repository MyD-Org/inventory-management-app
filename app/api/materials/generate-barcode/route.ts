import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import { auth } from "@/auth"

const sql = neon(process.env.DATABASE_URL!)

// Genera un código de barras de 8 dígitos garantizando que no exista en la base.
// Reintenta hasta encontrar uno libre (colisiones son rarísimas, pero así queda garantizado).
export async function GET() {
    const session = await auth()
    if (!session?.user) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    try {
        for (let i = 0; i < 20; i++) {
            const code = Math.floor(10000000 + Math.random() * 90000000).toString()
            const existing = await sql`SELECT 1 FROM materials WHERE barcode = ${code} LIMIT 1`
            if (existing.length === 0) {
                return NextResponse.json({ barcode: code })
            }
        }
        return NextResponse.json(
            { error: "No se pudo generar un código único, intentá de nuevo" },
            { status: 500 }
        )
    } catch (error) {
        console.error("Error generando código de barras:", error)
        return NextResponse.json({ error: "Error al generar el código" }, { status: 500 })
    }
}
