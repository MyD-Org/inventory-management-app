import { neon } from "@neondatabase/serverless"
import { NextRequest, NextResponse } from "next/server"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const materialId = params.id

        const movements = await sql`
            SELECT 
                id,
                movement_type,
                quantity,
                previous_stock,
                new_stock,
                reference_number,
                notes,
                user_name,
                created_at
            FROM stock_movements
            WHERE material_id = ${materialId}
            ORDER BY created_at DESC
            LIMIT 50
        `

        return NextResponse.json(movements)
    } catch (error) {
        console.error("Error fetching material movements:", error)
        return NextResponse.json(
            { error: "Error al obtener los movimientos" },
            { status: 500 }
        )
    }
}
