import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { getFlags } from "@/lib/feature-flags"
import { AppShell, SIDEBAR_COOKIE } from "@/components/app-shell"
import { SIMPLE_VIEW_COOKIE } from "@/lib/view-mode"
import { OperatorShell } from "@/components/operator-shell"
import { isOrdersOnly } from "@/lib/roles"

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

  // El rol "Solo pedidos" no tiene nada que ver acá: todo este módulo es el
  // inventario. Se corta ANTES de leer materiales, así ni siquiera se consulta
  // la base por datos que no va a ver.
  if (isOrdersOnly(session?.user?.role)) redirect("/pedidos")

  const [materials, flags] = await Promise.all([getMaterials(), getFlags()])

  // El sidebar plegado se recuerda en una cookie y NO en localStorage: leerlo acá
  // hace que el server ya pinte el ancho correcto. Con localStorage el primer
  // render sale siempre expandido y se ve el salto en cada carga.
  const collapsed = cookies().get(SIDEBAR_COOKIE)?.value === "1"

  // El operador no lleva sidebar: su única pantalla es el inicio y las dos
  // acciones de stock son un modal. Ver components/operator-shell.tsx.
  // El admin puede pedir esa misma pantalla desde el menú de su avatar
  // ("Vista simple"): es solo un cambio de shell, no de permisos.
  const vistaSimple = cookies().get(SIMPLE_VIEW_COOKIE)?.value === "1"
  if (session?.user && (session.user.role !== "admin" || vistaSimple)) {
    return <OperatorShell user={session.user}>{children}</OperatorShell>
  }

  return (
    <AppShell user={session?.user} materials={materials} flags={flags} defaultCollapsed={collapsed}>
      {children}
    </AppShell>
  )
}
