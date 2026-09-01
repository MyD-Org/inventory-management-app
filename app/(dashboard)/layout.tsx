import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { getFlags } from "@/lib/feature-flags"
import { AppShell, SIDEBAR_COOKIE } from "@/components/app-shell"

async function getMaterials() {
  try {
    const materials = await sql`
      SELECT m.id, m.name, m.barcode, i.current_stock, m.unit_of_measure, m.unit_cost
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

  // El sidebar plegado se recuerda en una cookie y NO en localStorage: leerlo acá
  // hace que el server ya pinte el ancho correcto. Con localStorage el primer
  // render sale siempre expandido y se ve el salto en cada carga.
  const collapsed = cookies().get(SIDEBAR_COOKIE)?.value === "1"

  return (
    <AppShell user={session?.user} materials={materials} flags={flags} defaultCollapsed={collapsed}>
      {children}
    </AppShell>
  )
}
