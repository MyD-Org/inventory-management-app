import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, TrendingDown, TrendingUp, AlertTriangle, DollarSign } from "lucide-react"
import { auth } from "@/auth"
import { formatCurrencyUSD } from "@/lib/formatters"

async function getInventoryStats() {
  try {
    // Total de materiales
    const totalMaterials = await sql`
      SELECT COUNT(*) as count FROM materials
    `

    // Total de stock
    const totalStock = await sql`
      SELECT SUM(current_stock) as total FROM inventory
    `

    // Materiales con stock bajo
    const lowStock = await sql`
      SELECT COUNT(*) as count 
      FROM inventory i
      JOIN materials m ON i.material_id = m.id
      WHERE i.current_stock <= m.min_stock
    `

    // Movimientos del día (según la zona horaria de Argentina, no UTC)
    const todayMovements = await sql`
      SELECT COUNT(*) as count
      FROM stock_movements
      WHERE (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    `

    // Valor total del inventario (stock * costo unitario)
    const totalValue = await sql`
      SELECT SUM(i.current_stock * m.unit_cost) as total
      FROM inventory i
      JOIN materials m ON i.material_id = m.id
    `

    return {
      totalMaterials: Number(totalMaterials[0]?.count || 0),
      totalStock: Number(totalStock[0]?.total || 0),
      lowStock: Number(lowStock[0]?.count || 0),
      todayMovements: Number(todayMovements[0]?.count || 0),
      totalValue: Number(totalValue[0]?.total || 0),
    }
  } catch (error) {
    console.error("Error fetching inventory stats:", error)
    return {
      totalMaterials: 0,
      totalStock: 0,
      lowStock: 0,
      todayMovements: 0,
      totalValue: 0,
    }
  }
}

export async function StatsCards() {
  const [stats, session] = await Promise.all([getInventoryStats(), auth()])
  const isAdmin = session?.user?.role === "admin"

  const cards = [
    {
      title: "Total Materiales",
      value: stats.totalMaterials.toLocaleString(),
      icon: Package,
      description: "Productos registrados",
    },
    {
      title: "Stock Total",
      value: stats.totalStock.toLocaleString(),
      icon: TrendingUp,
      description: "Unidades en inventario",
    },
    // Valor de inventario: información sensible, solo visible para admins
    ...(isAdmin
      ? [
          {
            title: "Valor de Inventario",
            value: formatCurrencyUSD(stats.totalValue),
            icon: DollarSign,
            description: "Costo total en stock",
          },
        ]
      : []),
    {
      title: "Stock Bajo",
      value: stats.lowStock.toLocaleString(),
      icon: AlertTriangle,
      description: "Requieren reposición",
      alert: stats.lowStock > 0,
    },
    {
      title: "Movimientos Hoy",
      value: stats.todayMovements.toLocaleString(),
      icon: TrendingDown,
      description: "Entradas y salidas",
    },
  ]

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
        isAdmin ? "lg:grid-cols-5" : "lg:grid-cols-4"
      }`}
    >
      {cards.map((card, index) => (
        <Card key={index} className={card.alert ? "border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className={`w-4 h-4 ${card.alert ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${card.alert ? "text-destructive" : "text-foreground"}`}>
              {card.value}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
