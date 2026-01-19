import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, RotateCcw } from "lucide-react"

async function getRecentMovements() {
  try {
    const movements = await sql`
      SELECT 
        sm.id,
        sm.movement_type,
        sm.quantity,
        sm.reference_number,
        sm.user_name,
        sm.created_at,
        m.name as material_name,
        m.barcode
      FROM stock_movements sm
      JOIN materials m ON sm.material_id = m.id
      ORDER BY sm.created_at DESC
      LIMIT 10
    `

    return movements
  } catch (error) {
    console.error("Error fetching recent movements:", error)
    return []
  }
}

export async function RecentMovements() {
  const movements = await getRecentMovements()

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "entrada":
        return TrendingUp
      case "salida":
        return TrendingDown
      case "ajuste":
        return RotateCcw
      default:
        return TrendingUp
    }
  }

  const getMovementColor = (type: string) => {
    switch (type) {
      case "entrada":
        return "text-green-500"
      case "salida":
        return "text-red-500"
      case "ajuste":
        return "text-blue-500"
      default:
        return "text-muted-foreground"
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Movimientos Recientes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {movements.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No hay movimientos registrados</p>
          ) : (
            movements.map((movement) => {
              const Icon = getMovementIcon(movement.movement_type)
              const colorClass = getMovementColor(movement.movement_type)

              return (
                <div key={movement.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Icon className={`w-5 h-5 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{movement.material_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {movement.barcode} • {movement.user_name || "Sistema"}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline">
                      {movement.movement_type === "entrada" ? "+" : movement.movement_type === "salida" ? "-" : "±"}
                      {Math.abs(movement.quantity)}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(movement.created_at).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}
