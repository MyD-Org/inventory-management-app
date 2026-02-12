import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

async function getInventoryItems() {
  try {
    const items = await sql`
      SELECT 
        m.id,
        m.name,
        m.barcode,
        m.unit_of_measure,
        m.min_stock,
        m.max_stock,
        i.current_stock,
        i.available_stock,
        i.reserved_stock,
        c.name as category_name,
        s.name as supplier_name
      FROM materials m
      JOIN inventory i ON m.id = i.material_id
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      ORDER BY m.name
      LIMIT 20
    `

    return items
  } catch (error) {
    console.error("Error fetching inventory items:", error)
    return []
  }
}

export async function InventoryTable() {
  const items = await getInventoryItems()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Inventario Principal</CardTitle>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre o código de barras..." className="pl-10" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium text-muted-foreground">Material</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Código</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Stock</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Estado</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Categoría</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const stockLevel =
                  item.current_stock <= item.min_stock
                    ? "low"
                    : item.current_stock >= item.max_stock
                      ? "high"
                      : "normal"

                return (
                  <tr key={item.id} className="border-b hover:bg-muted/50">
                    <td className="py-3">
                      <div>
                        <div className="font-medium text-foreground">{item.name}</div>
                        <div className="text-sm text-muted-foreground">{item.supplier_name}</div>
                      </div>
                    </td>
                    <td className="py-3 text-sm font-mono">{item.barcode}</td>
                    <td className="py-3">
                      <div className="text-sm">
                        <div className="font-medium">
                          {item.current_stock} {item.unit_of_measure}
                        </div>
                        {item.reserved_stock > 0 && (
                          <div className="text-muted-foreground">Reservado: {item.reserved_stock}</div>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge
                        variant={stockLevel === "low" ? "destructive" : stockLevel === "high" ? "secondary" : "default"}
                      >
                        {stockLevel === "low" ? "Stock Bajo" : stockLevel === "high" ? "Stock Alto" : "Normal"}
                      </Badge>
                    </td>
                    <td className="py-3 text-sm text-muted-foreground">{item.category_name}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
