import { neon } from "@neondatabase/serverless"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set")
}

// Crear cliente SQL reutilizable
export const sql = neon(process.env.DATABASE_URL)

// Tipos TypeScript para las tablas
export interface Category {
  id: number
  name: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: number
  name: string
  contact_person?: string
  email?: string
  phone?: string
  address?: string
  created_at: string
  updated_at: string
}

export interface Material {
  id: number
  barcode: string
  name: string
  description?: string
  category_id?: number
  supplier_id?: number
  unit_of_measure: string
  min_stock: number
  max_stock: number
  unit_cost: number
  created_at: string
  updated_at: string
}

export interface Inventory {
  id: number
  material_id: number
  current_stock: number
  reserved_stock: number
  available_stock: number
  last_updated: string
}

export interface StockMovement {
  id: number
  material_id: number
  movement_type: "entrada" | "salida" | "ajuste"
  quantity: number
  previous_stock: number
  new_stock: number
  reference_number?: string
  notes?: string
  user_name?: string
  created_at: string
}

// Tipo combinado para consultas con JOIN
export interface MaterialWithStock extends Material {
  current_stock: number
  available_stock: number
  reserved_stock: number
  category_name?: string
  supplier_name?: string
}
