import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

// Tool de IA (read-only): busca proveedores por nombre y devuelve su contacto
// (persona, email, teléfono, dirección) y los materiales que se le compran.
// Sin q: lista todos los proveedores (con su cantidad de materiales).
export async function GET(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get("q") ?? "").trim()
    const limit = parseLimit(searchParams.get("limit"), 10)

    try {
        const like = q ? `%${q}%` : null
        const suppliers = await sql`
            SELECT s.id, s.name, s.contact_person, s.email, s.phone, s.address,
                   COUNT(m.id)::int AS materiales_count
            FROM suppliers s
            LEFT JOIN materials m ON m.supplier_id = s.id
            WHERE ${like}::text IS NULL OR s.name ILIKE ${like}::text
            GROUP BY s.id
            ORDER BY s.name ASC
            LIMIT ${limit}
        `

        // Si hay una búsqueda puntual, incluimos la lista de materiales de cada proveedor.
        const withMaterials = q
            ? await Promise.all(
                  suppliers.map(async (s: any) => {
                      const materials = await sql`
                          SELECT m.id, m.name, m.barcode, m.unit_cost, i.current_stock
                          FROM materials m
                          LEFT JOIN inventory i ON i.material_id = m.id
                          WHERE m.supplier_id = ${s.id}
                          ORDER BY m.name ASC
                          LIMIT 50
                      `
                      return { ...s, materials }
                  }),
              )
            : suppliers

        return NextResponse.json({ count: withMaterials.length, suppliers: withMaterials })
    } catch (error) {
        console.error("Error in ai-tools/suppliers:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
