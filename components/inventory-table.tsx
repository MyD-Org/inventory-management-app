import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InventoryFilters } from "./inventory-filters"
import { InventoryTableClient } from "./inventory-table-client"
import { Pagination } from "./pagination"

interface InventoryTableProps {
  searchParams?: {
    search?: string
    category?: string
    status?: string
    page?: string
  }
}

const ITEMS_PER_PAGE = 25

async function getCategories() {
  try {
    const categories = await sql`SELECT id, name FROM categories ORDER BY name`
    return categories as unknown as { id: number; name: string }[]
  } catch (error) {
    console.error("Error fetching categories:", error)
    return []
  }
}

async function getSuppliers() {
  try {
    const suppliers = await sql`SELECT id, name FROM suppliers ORDER BY name`
    return suppliers as unknown as { id: number; name: string }[]
  } catch (error) {
    console.error("Error fetching suppliers:", error)
    return []
  }
}

async function getInventoryCount(search?: string, categoryId?: string, status?: string) {
  try {
    const searchPattern = search ? `%${search}%` : null
    const categoryFilter = categoryId && categoryId !== 'all' ? categoryId : null
    const statusFilter = status && status !== 'all' ? status : null

    const result = await sql`
      SELECT 
        COUNT(DISTINCT m.id) as total
      FROM materials m
      JOIN inventory i ON m.id = i.material_id
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      WHERE 
        (${searchPattern}::text IS NULL OR m.name ILIKE ${searchPattern} OR m.barcode ILIKE ${searchPattern})
        AND (${categoryFilter}::int IS NULL OR m.category_id = ${categoryFilter})
        AND (
          ${statusFilter}::text IS NULL OR
          (${statusFilter} = 'low' AND i.current_stock <= m.min_stock) OR
          (${statusFilter} = 'high' AND i.current_stock >= m.max_stock) OR
          (${statusFilter} = 'normal' AND i.current_stock > m.min_stock AND i.current_stock < m.max_stock)
        )
    `

    return Number(result[0]?.total || 0)
  } catch (error) {
    console.error("Error fetching inventory count:", error)
    return 0
  }
}

async function getInventoryItemsPaged(
  search: string | undefined,
  categoryId: string | undefined,
  status: string | undefined,
  page: number
) {
  try {
    const searchPattern = search ? `%${search}%` : null
    const categoryFilter = categoryId && categoryId !== 'all' ? categoryId : null
    const statusFilter = status && status !== 'all' ? status : null
    const offset = (page - 1) * ITEMS_PER_PAGE

    const items = await sql`
      SELECT 
        m.id,
        m.name,
        m.barcode,
        m.description,
        m.category_id,
        m.supplier_id,
        m.unit_of_measure,
        m.unit_cost,
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
      WHERE 
        (${searchPattern}::text IS NULL OR m.name ILIKE ${searchPattern} OR m.barcode ILIKE ${searchPattern})
        AND (${categoryFilter}::int IS NULL OR m.category_id = ${categoryFilter})
        AND (
          ${statusFilter}::text IS NULL OR
          (${statusFilter} = 'low' AND i.current_stock <= m.min_stock) OR
          (${statusFilter} = 'high' AND i.current_stock >= m.max_stock) OR
          (${statusFilter} = 'normal' AND i.current_stock > m.min_stock AND i.current_stock < m.max_stock)
        )
      ORDER BY m.name
      LIMIT ${ITEMS_PER_PAGE}
      OFFSET ${offset}
    `

    return items
  } catch (error) {
    console.error("Error fetching inventory items:", error)
    return []
  }
}

import { auth } from "@/auth"

export async function InventoryTable({ searchParams }: InventoryTableProps) {
  const session = await auth()
  const pageParam = searchParams?.page ? Number.parseInt(searchParams.page, 10) : 1

  const [categories, suppliers, totalCount] = await Promise.all([
    getCategories(),
    getSuppliers(),
    getInventoryCount(
      searchParams?.search,
      searchParams?.category,
      searchParams?.status
    ),
  ])
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / ITEMS_PER_PAGE) : 0
  const currentPage = totalPages > 0 ? Math.min(Math.max(pageParam, 1), totalPages) : 1
  const items = await getInventoryItemsPaged(
    searchParams?.search,
    searchParams?.category,
    searchParams?.status,
    currentPage
  )

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams || {})) {
      if (key === "page") continue
      if (typeof value === "string") params.set(key, value)
    }
    params.set("page", String(page))
    return `/inventory?${params.toString()}`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Inventario Principal</CardTitle>
        <InventoryFilters categories={categories} />
      </CardHeader>
      <CardContent>
        <InventoryTableClient
          items={items}
          categories={categories}
          suppliers={suppliers}
          userRole={session?.user?.role}
        />
        {totalPages > 1 && (
          <div className="mt-4 flex justify-end">
            <Pagination currentPage={currentPage} totalPages={totalPages} buildHref={buildPageHref} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
