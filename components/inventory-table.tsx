import { sql } from "@/lib/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InventoryFilters } from "./inventory-filters"
import { EditMaterialDialog } from "./edit-material-dialog"
import { InventoryTableClient } from "./inventory-table-client"

interface InventoryTableProps {
  searchParams?: {
    search?: string
    category?: string
    status?: string
  }
}

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

async function getInventoryItems(search?: string, categoryId?: string, status?: string) {
  try {
    const searchPattern = search ? `%${search}%` : null
    const categoryFilter = categoryId && categoryId !== 'all' ? categoryId : null
    const statusFilter = status && status !== 'all' ? status : null

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
      LIMIT 100
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
  const [categories, suppliers, items] = await Promise.all([
    getCategories(),
    getSuppliers(),
    getInventoryItems(
      searchParams?.search,
      searchParams?.category,
      searchParams?.status
    )
  ])

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
      </CardContent>
    </Card>
  )
}
