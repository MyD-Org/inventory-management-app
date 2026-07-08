import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown } from "lucide-react"

async function getMonthlyMovements() {
  try {
    // Movimientos del mes actual
    const monthly = await sql`
      SELECT movement_type, COUNT(*) as count, SUM(ABS(quantity)) as total_quantity
      FROM stock_movements
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY movement_type
    `

    // Comparación con el mes anterior
    const previous = await sql`
      SELECT movement_type, COUNT(*) as count
      FROM stock_movements
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
      GROUP BY movement_type
    `

    return {
      current: monthly.reduce(
        (acc, curr) => {
          acc[curr.movement_type] = { count: Number(curr.count), quantity: Number(curr.total_quantity) }
          return acc
        },
        {} as Record<string, { count: number; quantity: number }>,
      ),
      previous: previous.reduce(
        (acc, curr) => {
          acc[curr.movement_type] = Number(curr.count)
          return acc
        },
        {} as Record<string, number>,
      ),
    }
  } catch (error) {
    console.error("Error fetching monthly movements:", error)
    return { current: {}, previous: {} }
  }
}

function getTrend(current: number, previous: number) {
  if (previous === 0) return { trend: "neutral" as const, percentage: 0 }
  const change = ((current - previous) / previous) * 100
  return {
    trend: change > 0 ? ("up" as const) : change < 0 ? ("down" as const) : ("neutral" as const),
    percentage: Math.abs(change),
  }
}

export async function MonthlyMovementsSummary() {
  const data = await getMonthlyMovements()

  const entradaTrend = getTrend(data.current?.entrada?.count || 0, data.previous?.entrada || 0)
  const salidaTrend = getTrend(data.current?.salida?.count || 0, data.previous?.salida || 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Entradas del Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{data.current?.entrada?.count || 0}</span>
              <Badge
                variant={
                  entradaTrend.trend === "up"
                    ? "default"
                    : entradaTrend.trend === "down"
                      ? "destructive"
                      : "secondary"
                }
              >
                {entradaTrend.trend === "up" ? "↑" : entradaTrend.trend === "down" ? "↓" : "→"}
                {entradaTrend.percentage.toFixed(1)}%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {(data.current?.entrada?.quantity || 0).toLocaleString()} unidades ingresadas
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-600" />
            Salidas del Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{data.current?.salida?.count || 0}</span>
              <Badge
                variant={
                  salidaTrend.trend === "up" ? "destructive" : salidaTrend.trend === "down" ? "default" : "secondary"
                }
              >
                {salidaTrend.trend === "up" ? "↑" : salidaTrend.trend === "down" ? "↓" : "→"}
                {salidaTrend.percentage.toFixed(1)}%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {(data.current?.salida?.quantity || 0).toLocaleString()} unidades retiradas
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
