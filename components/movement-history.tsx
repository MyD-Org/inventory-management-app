import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, RotateCcw, Calendar } from "lucide-react"
import { MovementFilters } from "./movement-filters"
import { DownloadMovementsButton } from "./download-movements-button"
import { MovementHistoryLoadingOverlay, MovementHistoryProvider } from "./movement-history-context"
import { Pagination } from "./pagination"

const MOVEMENTS_PER_PAGE = 25

async function getMovementHistoryCount(params: { search?: string; type?: string; from?: string; to?: string }) {
  const { search, type, from, to } = params

  try {
    const searchVal = search ? `%${search}%` : null
    const typeVal = type || "all"
    const fromVal = from ? new Date(from).toISOString() : null
    const toVal = to ? new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString() : null

    const result = await sql`
      SELECT 
        COUNT(*) as total
      FROM stock_movements sm
      JOIN materials m ON sm.material_id = m.id
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE 
        (${searchVal}::text IS NULL OR (m.name ILIKE ${searchVal}::text OR m.barcode ILIKE ${searchVal}::text OR sm.reference_number ILIKE ${searchVal}::text))
        AND (${typeVal}::text = 'all' OR sm.movement_type = ${typeVal}::text)
        AND (${fromVal}::text IS NULL OR sm.created_at >= ${fromVal}::timestamp)
        AND (${toVal}::text IS NULL OR sm.created_at <= ${toVal}::timestamp)
    `

    return Number(result[0]?.total || 0)
  } catch (error) {
    console.error("Error fetching movement history count:", error)
    return 0
  }
}

async function getMovementHistory(params: { search?: string; type?: string; from?: string; to?: string; page?: number }) {
  const { search, type, from, to, page = 1 } = params
  const offset = (page - 1) * MOVEMENTS_PER_PAGE

  try {
    const searchVal = search ? `%${search}%` : null
    const typeVal = type || "all"
    const fromVal = from ? new Date(from).toISOString() : null
    const toVal = to ? new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString() : null

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
      WHERE 
        (${searchVal}::text IS NULL OR (m.name ILIKE ${searchVal}::text OR m.barcode ILIKE ${searchVal}::text OR sm.reference_number ILIKE ${searchVal}::text))
        AND (${typeVal}::text = 'all' OR sm.movement_type = ${typeVal}::text)
        AND (${fromVal}::text IS NULL OR sm.created_at >= ${fromVal}::timestamp)
        AND (${toVal}::text IS NULL OR sm.created_at <= ${toVal}::timestamp)
      ORDER BY sm.created_at DESC
      LIMIT ${MOVEMENTS_PER_PAGE}
      OFFSET ${offset}
    `

    return movements.map((movement: any) => ({
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

export async function MovementHistory({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const search = typeof searchParams?.search === "string" ? searchParams.search : undefined
  const type = typeof searchParams?.type === "string" ? searchParams.type : undefined
  const from = typeof searchParams?.from === "string" ? searchParams.from : undefined
  const to = typeof searchParams?.to === "string" ? searchParams.to : undefined
  const pageParam = typeof searchParams?.page === "string" ? Number.parseInt(searchParams.page, 10) : 1

  const totalCount = await getMovementHistoryCount({ search, type, from, to })
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / MOVEMENTS_PER_PAGE) : 0
  const currentPage = totalPages > 0 ? Math.min(Math.max(pageParam, 1), totalPages) : 1

  const movements = await getMovementHistory({ search, type, from, to, page: currentPage })

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

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams || {})) {
      if (key === "page") continue
      if (typeof value === "string") params.set(key, value)
    }
    params.set("page", String(page))
    return `/reports?${params.toString()}`
  }

  return (
    <MovementHistoryProvider>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Historial de Movimientos
            </CardTitle>
            <DownloadMovementsButton />
          </div>

          <MovementFilters />
        </CardHeader>
        <CardContent>
          <MovementHistoryLoadingOverlay>
            <div>
              <div className="space-y-3">
                {movements.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No hay movimientos que coincidan con los filtros
                  </p>
                ) : (
                  movements.map((movement) => {
                    const Icon = getMovementIcon(movement.movement_type)
                    const colorClass = getMovementColor(movement.movement_type)
                    const badgeVariant = getMovementBadge(movement.movement_type)

                  return (
                    <div
                      key={movement.id}
                      className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 md:flex-row md:items-center md:gap-4"
                    >
                      <div className="flex items-center gap-2 md:w-[36%] md:min-w-0">
                        <Icon className={`h-4 w-4 ${colorClass}`} />
                        <div className="min-w-0">
                          <h4 className="truncate font-medium text-foreground">{movement.material_name}</h4>
                          <p className="truncate text-xs text-muted-foreground">
                            {movement.barcode} • {movement.category_name}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground md:w-[28%] md:justify-start">
                        <span className="font-medium text-foreground/80">{movement.user_name}</span>
                        <span className="hidden md:inline">•</span>
                        <span>
                          {new Date(movement.created_at).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {movement.reference_number && (
                          <>
                            <span className="hidden md:inline">•</span>
                            <span>Ref: {movement.reference_number}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-between md:ml-auto md:w-[28%] md:justify-end md:gap-3">
                        {movement.notes && (
                          <span className="mr-2 hidden max-w-[220px] truncate text-xs italic text-muted-foreground md:inline">
                            {movement.notes}
                          </span>
                        )}
                        <div className="text-right">
                          <Badge variant={badgeVariant as any}>
                            {movement.movement_type === "entrada" ? "+" : movement.movement_type === "salida" ? "-" : "±"}
                            {Math.abs(movement.quantity)}
                          </Badge>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {movement.previous_stock} → {movement.new_stock}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              {totalPages > 1 && (
                <div className="mt-4 flex justify-end">
                  <Pagination currentPage={currentPage} totalPages={totalPages} buildHref={buildPageHref} />
                </div>
              )}
            </div>
          </MovementHistoryLoadingOverlay>
        </CardContent>
      </Card>
    </MovementHistoryProvider>
  )
}
