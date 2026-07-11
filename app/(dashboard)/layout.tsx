import type { ReactNode } from "react"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { getFlags } from "@/lib/feature-flags"
import { AppShell } from "@/components/app-shell"

async function getMaterials() {
  try {
    const materials = await sql`
      SELECT m.id, m.name, m.barcode, i.current_stock, m.unit_of_measure
      FROM materials m
      JOIN inventory i ON m.id = i.material_id
      ORDER BY m.name
    `
    return materials as any[]
  } catch (error) {
    console.error("Error fetching materials:", error)
    return []
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const [materials, flags] = await Promise.all([getMaterials(), getFlags()])

  return (
    <AppShell user={session?.user} materials={materials} flags={flags}>
      {children}
    </AppShell>
  )
}
