import { sql } from "@/lib/database"
import { InventoryChartsClient } from "./inventory-charts-client"

async function getChartData() {
  try {
    // Stock por categoría
    const stockByCategory = await sql`
      SELECT 
        c.name as category,
        SUM(i.current_stock) as total_stock,
        COUNT(m.id) as material_count
      FROM categories c
      LEFT JOIN materials m ON c.id = m.category_id
      LEFT JOIN inventory i ON m.id = i.material_id
      GROUP BY c.id, c.name
      ORDER BY total_stock DESC
    `

    // Movimientos por día (últimos 7 días)
    const movementsByDay = await sql`
      SELECT 
        DATE(created_at) as date,
        movement_type,
        COUNT(*) as count,
        SUM(ABS(quantity)) as total_quantity
      FROM stock_movements 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at), movement_type
      ORDER BY date DESC
    `

    // Top materiales con más movimientos
    const topMaterials = await sql`
      SELECT 
        m.name,
        m.barcode,
        COUNT(sm.id) as movement_count,
        SUM(CASE WHEN sm.movement_type = 'entrada' THEN sm.quantity ELSE 0 END) as total_entries,
        SUM(CASE WHEN sm.movement_type = 'salida' THEN ABS(sm.quantity) ELSE 0 END) as total_exits
      FROM materials m
      JOIN stock_movements sm ON m.id = sm.material_id
      WHERE sm.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY m.id, m.name, m.barcode
      ORDER BY movement_count DESC
      LIMIT 10
    `

    // Stock bajo vs normal
    const stockStatus = await sql`
      SELECT 
        CASE 
          WHEN i.current_stock <= m.min_stock THEN 'Bajo'
          WHEN i.current_stock >= m.max_stock THEN 'Alto'
          ELSE 'Normal'
        END as status,
        COUNT(*) as count
      FROM inventory i
      JOIN materials m ON i.material_id = m.id
      GROUP BY 
        CASE 
          WHEN i.current_stock <= m.min_stock THEN 'Bajo'
          WHEN i.current_stock >= m.max_stock THEN 'Alto'
          ELSE 'Normal'
        END
    `

    return {
      stockByCategory: stockByCategory.map((item) => ({
        category: item.category,
        stock: Number(item.total_stock || 0),
        materials: Number(item.material_count || 0),
      })),
      movementsByDay: movementsByDay.map((item) => ({
        date: item.date,
        type: item.movement_type,
        count: Number(item.count),
        quantity: Number(item.total_quantity),
      })),
      topMaterials: topMaterials.map((item) => ({
        name: item.name,
        barcode: item.barcode,
        movements: Number(item.movement_count),
        entries: Number(item.total_entries),
        exits: Number(item.total_exits),
      })),
      stockStatus: stockStatus.map((item) => ({
        status: item.status,
        count: Number(item.count),
      })),
    }
  } catch (error) {
    console.error("Error fetching chart data:", error)
    return {
      stockByCategory: [],
      movementsByDay: [],
      topMaterials: [],
      stockStatus: [],
    }
  }
}

export async function InventoryCharts() {
  const data = await getChartData()

  return <InventoryChartsClient data={data} />
}
