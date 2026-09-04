import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"

// Catálogo de productos para el bot del CRM.
//
// POR QUÉ EXISTE: el bot manda el nombre del producto como texto libre y el
// servidor intenta matchearlo contra el catálogo. Con 1704 productos y nombres
// parecidos ("Optic 1 12-24v", "Optic 1 de embutir 12-24V"), un "optic 1" suelto
// es ambiguo y la línea entra sin resolver. Con esto el bot busca primero,
// pregunta cuál si hay varios, y manda el nombre exacto.
//
// Es el mismo principio que /api/specs: el bot solo ofrece lo que existe.
//
// ═══════════════════════════════════════════════════════════════════════════
// SIN PRECIOS. NUNCA.
//
// El canal del CRM es deliberadamente sin plata (docs/pedidos-avantec.md: "por
// este canal no se habla de plata"). Este endpoint devuelve NOMBRES y COLORES
// disponibles, nada más. La consulta selecciona columna por columna a propósito
// —no hay SELECT *— para que agregar un precio sea una decisión explícita y no
// algo que se cuele al tocar la tabla.
//
// Si alguna vez hace falta un precio para el bot, no se agrega acá: se hace un
// endpoint aparte, con su propia autorización.
// ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim()

    try {
        // Se agrupa por producto base: al cliente se le ofrece "Optic 1 12-24v" y
        // después el color, no los 12 ítems por separado.
        //
        // Solo ACTIVOS: los inactivos son versiones discontinuadas y ofrecerlas
        // llevaría a tomar pedidos de algo que ya no se vende.
        // account = 'Ventas': la propia clasificación contable del taller. Separa
        // lo que se le vende a un cliente de lo que solo se compra para fabricar.
        // Sin esto el bot ofrecía grampas y arandelas como si fueran equipos.
        // La búsqueda también toma el código de referencia: el cliente muchas
        // veces pide por código y no por el nombre largo del catálogo.
        const rows = q
            ? await sql`
                SELECT base_name,
                       ARRAY_REMOVE(ARRAY_AGG(DISTINCT variant_label), NULL) AS variantes,
                       MIN(reference) AS reference
                FROM alegra_items
                WHERE status = 'active' AND account = 'Ventas'
                  AND (base_name ILIKE ${`%${q}%`} OR reference ILIKE ${`%${q}%`})
                GROUP BY base_name
                ORDER BY base_name ASC
                LIMIT 25
            `
            : await sql`
                SELECT base_name,
                       ARRAY_REMOVE(ARRAY_AGG(DISTINCT variant_label), NULL) AS variantes,
                       MIN(reference) AS reference
                FROM alegra_items
                WHERE status = 'active' AND account = 'Ventas'
                GROUP BY base_name
                ORDER BY base_name ASC
                LIMIT 25
            `

        return NextResponse.json({
            count: rows.length,
            // 'producto' es el valor que hay que mandar en POST /api/pedidos.
            // 'colores' son los que ese producto tiene cargados; si viene vacío,
            // ese producto no se vende por color.
            productos: rows.map((r: any) => ({
                producto: r.base_name as string,
                colores: (r.variantes as string[]) ?? [],
                // Código de Alegra. Se puede buscar por él y se puede mandar en
                // POST /api/pedidos en lugar del nombre. null = todavía sin cargar.
                codigo: (r.reference as string | null) ?? null,
            })),
        })
    } catch (error) {
        console.error("Error in /api/productos:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
