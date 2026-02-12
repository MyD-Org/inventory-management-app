import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"

async function getLowStockItems() {
  try {
    const lowStockItems = await sql`
      SELECT 
        m.id,
        m.name,
        m.barcode,
        m.unit_of_measure,
        m.min_stock,
        i.current_stock,
        i.available_stock,
        c.name as category_name
      FROM materials m
      JOIN inventory i ON m.id = i.material_id
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE i.current_stock <= m.min_stock
      ORDER BY (i.current_stock::float / NULLIF(m.min_stock, 0)) ASC
      LIMIT 10
    `

    return lowStockItems
  } catch (error) {
    console.error("Error fetching low stock items:", error)
    return []
  }
}

export async function LowStockAlerts() {
  const lowStockItems = await getLowStockItems()

  if (lowStockItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-green-500" />
            Alertas de Stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">¡Excelente! No hay materiales con stock bajo.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          Alertas de Stock Bajo ({lowStockItems.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {lowStockItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex-1">
                <div className="font-medium text-foreground">{item.name}</div>
                <div className="text-sm text-muted-foreground">
                  Código: {item.barcode} • {item.category_name}
                </div>
              </div>
              <div className="text-right">
                <Badge variant="destructive" className="mb-1">
                  {item.current_stock} {item.unit_of_measure}
                </Badge>
                <div className="text-xs text-muted-foreground">Mín: {item.min_stock}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
