import Link from "next/link"
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

    const totalResult = await sql`
      SELECT COUNT(*) as count
      FROM inventory i
      JOIN materials m ON i.material_id = m.id
      WHERE i.current_stock <= m.min_stock
    `

    return { items: lowStockItems, total: Number(totalResult[0]?.count || 0) }
  } catch (error) {
    console.error("Error fetching low stock items:", error)
    return { items: [], total: 0 }
  }
}

export async function LowStockAlerts() {
  const { items: lowStockItems, total } = await getLowStockItems()

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
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          Alertas de Stock Bajo ({total})
        </CardTitle>
        <Link
          href="/inventory?status=low"
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          Ver todos →
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {lowStockItems.map((item) => (
            <Link
              key={item.id}
              href={`/materials/${item.id}`}
              className="flex items-center justify-between p-3 bg-muted rounded-lg transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
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
            </Link>
          ))}
        </div>
        {total > lowStockItems.length && (
          <Link
            href="/inventory?status=low"
            className="mt-3 flex items-center justify-center rounded-lg border border-dashed p-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Ver los {total - lowStockItems.length} restantes en Inventario →
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
