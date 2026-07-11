import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { DashboardWorkspace } from "@/components/dashboards/dashboard-workspace"
import type { DashboardDocument } from "@myd-org/sdui-dashboard"

export const dynamic = "force-dynamic"

export default async function DashboardDetailPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const [row] = (await sql`SELECT id, document FROM dashboards WHERE id = ${id}`) as Array<{
    id: number
    document: DashboardDocument
  }>
  if (!row) notFound()

  return <DashboardWorkspace dashboardId={row.id} initialDocument={row.document} />
}
