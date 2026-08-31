import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret, parseLimit } from "@/lib/ai-tools-auth"

// Tool de IA (read-only): recorre el inventario con filtros y paginado.
//
// Existe porque search_materials necesita un término de búsqueda, y hay preguntas
// que no lo tienen: "¿cuántos materiales están sin precio?", "¿qué le compro a tal
// proveedor?", "¿qué hay bajo mínimo en la categoría X?". Sin esto el agente no
// tiene forma de contarlos y termina inventando o pidiendo recorrer a mano.
//
// La respuesta trae los AGREGADOS del filtro, no solo la página: con total_matching
// el conteo exacto sale en una sola llamada, sin paginar hasta el final.

const COSTOS = ["all", "zero", "nonzero"] as const
const STOCKS = ["all", "low", "out", "in_stock"] as const

type Costo = (typeof COSTOS)[number]
type Stock = (typeof STOCKS)[number]

// Los params de la tool pueden venir vacíos o con cualquier cosa: un valor que no
// está en la lista cae al default y se devuelve en `filters`, así el agente ve con
// qué se filtró de verdad en vez de creer que aplicó algo que se ignoró.
function opcion<T extends string>(raw: string | null, validas: readonly T[], porDefecto: T): T {
  const v = (raw ?? "").trim().toLowerCase()
  return (validas as readonly string[]).includes(v) ? (v as T) : porDefecto
}

export async function GET(request: NextRequest) {
  const denied = requireInternalSecret(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const cost = opcion<Costo>(searchParams.get("cost"), COSTOS, "all")
  const stock = opcion<Stock>(searchParams.get("stock"), STOCKS, "all")
  const category = (searchParams.get("category") ?? "").trim()
  const supplier = (searchParams.get("supplier") ?? "").trim()
  const limit = parseLimit(searchParams.get("limit"), 50, 200)
  const offsetRaw = Number.parseInt(searchParams.get("offset") ?? "", 10)
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0

  // Vacío = sin filtrar. El ILIKE con % permite "silicona" para "Siliconas SRL".
  const categoryLike = category ? `%${category}%` : null
  const supplierLike = supplier ? `%${supplier}%` : null

  try {
    // Dos consultas y no una con COUNT(*) OVER(): la ventana se calcula sobre la
    // página, así que un offset más allá del final devolvería total_matching 0 y
    // el agente concluiría que no hay nada. Las condiciones son las mismas en las
    // dos; si se toca una hay que tocar la otra.
    const [totales] = await sql`
      SELECT
        COUNT(*)::int AS total_matching,
        COALESCE(SUM(i.current_stock * m.unit_cost), 0)::numeric(14,2) AS total_value_matching
      FROM materials m
      JOIN inventory i ON i.material_id = m.id
      LEFT JOIN categories c ON c.id = m.category_id
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      WHERE (${cost}::text = 'all'
             OR (${cost}::text = 'zero' AND m.unit_cost = 0)
             OR (${cost}::text = 'nonzero' AND m.unit_cost > 0))
        AND (${stock}::text = 'all'
             OR (${stock}::text = 'out' AND i.current_stock = 0)
             OR (${stock}::text = 'low' AND i.current_stock <= m.min_stock)
             OR (${stock}::text = 'in_stock' AND i.current_stock > 0))
        AND (${categoryLike}::text IS NULL OR c.name ILIKE ${categoryLike}::text)
        AND (${supplierLike}::text IS NULL OR s.name ILIKE ${supplierLike}::text)
    `

    const rows = await sql`
      SELECT
        m.id,
        m.name,
        m.barcode,
        m.unit_of_measure,
        m.unit_cost,
        m.min_stock,
        i.current_stock,
        i.available_stock,
        c.name AS category_name,
        s.name AS supplier_name
      FROM materials m
      JOIN inventory i ON i.material_id = m.id
      LEFT JOIN categories c ON c.id = m.category_id
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      WHERE (${cost}::text = 'all'
             OR (${cost}::text = 'zero' AND m.unit_cost = 0)
             OR (${cost}::text = 'nonzero' AND m.unit_cost > 0))
        AND (${stock}::text = 'all'
             OR (${stock}::text = 'out' AND i.current_stock = 0)
             OR (${stock}::text = 'low' AND i.current_stock <= m.min_stock)
             OR (${stock}::text = 'in_stock' AND i.current_stock > 0))
        AND (${categoryLike}::text IS NULL OR c.name ILIKE ${categoryLike}::text)
        AND (${supplierLike}::text IS NULL OR s.name ILIKE ${supplierLike}::text)
      ORDER BY m.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({
      total_matching: totales.total_matching,
      total_value_matching: totales.total_value_matching,
      limit,
      offset,
      // Cuántos vienen en ESTA página. Con total_matching alcanza para saber si
      // falta pedir otra (offset + count < total_matching).
      count: rows.length,
      filters: { cost, stock, category: category || null, supplier: supplier || null },
      materials: rows,
    })
  } catch (error) {
    console.error("Error in ai-tools/list-materials:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
