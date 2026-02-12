import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TrendingUp, TrendingDown, RotateCcw, Search, Calendar } from "lucide-react"

async function getMovementHistory(limit = 50) {
  try {
    const movements = await sql`
      SELECT 
        sm.id,
        sm.movement_type,
        sm.quantity,
        sm.previous_stock,
        sm.new_stock,
        sm.reference_number,
        sm.notes,
        sm.user_name,
        sm.created_at,
        m.name as material_name,
        m.barcode,
        c.name as category_name
      FROM stock_movements sm
      JOIN materials m ON sm.material_id = m.id
      LEFT JOIN categories c ON m.category_id = c.id
      ORDER BY sm.created_at DESC
      LIMIT ${limit}
    `

    return movements.map((movement) => ({
      id: movement.id,
      movement_type: movement.movement_type,
      quantity: Number(movement.quantity),
      previous_stock: Number(movement.previous_stock),
      new_stock: Number(movement.new_stock),
      reference_number: movement.reference_number,
      notes: movement.notes,
      user_name: movement.user_name,
      created_at: movement.created_at,
      material_name: movement.material_name,
      barcode: movement.barcode,
      category_name: movement.category_name,
    }))
  } catch (error) {
    console.error("Error fetching movement history:", error)
    return []
  }
}

export async function MovementHistory() {
  const movements = await getMovementHistory()

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
        return "text-green-600"
      case "salida":
        return "text-red-600"
      case "ajuste":
        return "text-blue-600"
      default:
        return "text-muted-foreground"
    }
  }

  const getMovementBadge = (type: string) => {
    switch (type) {
      case "entrada":
        return "default"
      case "salida":
        return "destructive"
      case "ajuste":
        return "secondary"
      default:
        return "outline"
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Historial de Movimientos
        </CardTitle>

        {/* Filtros */}
        <div className="flex gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por material o código..." className="pl-10" />
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Tipo de movimiento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="salida">Salidas</SelectItem>
              <SelectItem value="ajuste">Ajustes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {movements.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No hay movimientos registrados</p>
          ) : (
            movements.map((movement) => {
              const Icon = getMovementIcon(movement.movement_type)
              const colorClass = getMovementColor(movement.movement_type)
              const badgeVariant = getMovementBadge(movement.movement_type)

              return (
                <div key={movement.id} className="flex items-start gap-3 p-4 border rounded-lg hover:bg-muted/50">
                  <Icon className={`w-5 h-5 mt-1 ${colorClass}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-foreground truncate">{movement.material_name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {movement.barcode} • {movement.category_name}
                        </p>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <Badge variant={badgeVariant as any}>
                          {movement.movement_type === "entrada" ? "+" : movement.movement_type === "salida" ? "-" : "±"}
                          {Math.abs(movement.quantity)}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {movement.previous_stock} → {movement.new_stock}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>{movement.user_name}</span>
                        <span>
                          {new Date(movement.created_at).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {movement.reference_number && (
                        <div className="mt-1">
                          <span className="font-medium">Ref:</span> {movement.reference_number}
                        </div>
                      )}

                      {movement.notes && <div className="mt-1 text-xs">{movement.notes}</div>}
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
