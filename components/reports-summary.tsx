import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Package, AlertTriangle, DollarSign } from "lucide-react"

async function getReportsSummary() {
  try {
    // Resumen general
    const summary = await sql`
      SELECT 
        COUNT(DISTINCT m.id) as total_materials,
        SUM(i.current_stock) as total_stock,
        COUNT(CASE WHEN i.current_stock <= m.min_stock THEN 1 END) as low_stock_count,
        SUM(m.unit_cost * i.current_stock) as total_value
      FROM materials m
      JOIN inventory i ON m.id = i.material_id
    `

    // Movimientos del mes actual
    const monthlyMovements = await sql`
      SELECT 
        movement_type,
        COUNT(*) as count,
        SUM(ABS(quantity)) as total_quantity
      FROM stock_movements 
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY movement_type
    `

    // Comparación con mes anterior
    const previousMonthMovements = await sql`
      SELECT 
        movement_type,
        COUNT(*) as count
      FROM stock_movements 
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
      GROUP BY movement_type
    `

    // Materiales más críticos
    const criticalMaterials = await sql`
      SELECT 
        m.name,
        m.barcode,
        i.current_stock,
        m.min_stock,
        c.name as category_name
      FROM materials m
      JOIN inventory i ON m.id = i.material_id
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE i.current_stock <= m.min_stock
      ORDER BY (i.current_stock::float / NULLIF(m.min_stock, 0)) ASC
      LIMIT 5
    `

    return {
      summary: summary[0] || { total_materials: 0, total_stock: 0, low_stock_count: 0, total_value: 0 },
      monthlyMovements: monthlyMovements.reduce(
        (acc, curr) => {
          acc[curr.movement_type] = { count: Number(curr.count), quantity: Number(curr.total_quantity) }
          return acc
        },
        {} as Record<string, { count: number; quantity: number }>,
      ),
      previousMonthMovements: previousMonthMovements.reduce(
        (acc, curr) => {
          acc[curr.movement_type] = Number(curr.count)
          return acc
        },
        {} as Record<string, number>,
      ),
      criticalMaterials: criticalMaterials.map((item) => ({
        name: item.name,
        barcode: item.barcode,
        current_stock: Number(item.current_stock),
        min_stock: Number(item.min_stock),
        category_name: item.category_name,
        percentage: item.min_stock > 0 ? (Number(item.current_stock) / Number(item.min_stock)) * 100 : 0,
      })),
    }
  } catch (error) {
    console.error("Error fetching reports summary:", error)
    return {
      summary: { total_materials: 0, total_stock: 0, low_stock_count: 0, total_value: 0 },
      monthlyMovements: {},
      previousMonthMovements: {},
      criticalMaterials: [],
    }
  }
}

export async function ReportsSummary() {
  const data = await getReportsSummary()

  const getMovementTrend = (current: number, previous: number) => {
    if (previous === 0) return { trend: "neutral", percentage: 0 }
    const change = ((current - previous) / previous) * 100
    return {
      trend: change > 0 ? "up" : change < 0 ? "down" : "neutral",
      percentage: Math.abs(change),
    }
  }

  const entradaTrend = getMovementTrend(
    data.monthlyMovements.entrada?.count || 0,
    data.previousMonthMovements.entrada || 0,
  )

  const salidaTrend = getMovementTrend(
    data.monthlyMovements.salida?.count || 0,
    data.previousMonthMovements.salida || 0,
  )

  return (
    <div className="space-y-6">
      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Materiales</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.total_materials}</div>
            <p className="text-xs text-muted-foreground">Productos registrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Total</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(data.summary.total_stock).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Unidades en inventario</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${Number(data.summary.total_value).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Valor del inventario</p>
          </CardContent>
        </Card>

        <Card className={data.summary.low_stock_count > 0 ? "border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Bajo</CardTitle>
            <AlertTriangle
              className={`w-4 h-4 ${data.summary.low_stock_count > 0 ? "text-destructive" : "text-muted-foreground"}`}
            />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.summary.low_stock_count > 0 ? "text-destructive" : ""}`}>
              {data.summary.low_stock_count}
            </div>
            <p className="text-xs text-muted-foreground">Requieren reposición</p>
          </CardContent>
        </Card>
      </div>

      {/* Movimientos del mes */}
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
                <span className="text-2xl font-bold">{data.monthlyMovements.entrada?.count || 0}</span>
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
                {(data.monthlyMovements.entrada?.quantity || 0).toLocaleString()} unidades ingresadas
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
                <span className="text-2xl font-bold">{data.monthlyMovements.salida?.count || 0}</span>
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
                {(data.monthlyMovements.salida?.quantity || 0).toLocaleString()} unidades retiradas
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Materiales críticos */}
      {data.criticalMaterials.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Materiales Críticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.criticalMaterials.map((material, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950 dark:border-red-800"
                >
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{material.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {material.barcode} • {material.category_name}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="destructive">
                      {material.current_stock} / {material.min_stock}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {material.percentage.toFixed(0)}% del mínimo
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
