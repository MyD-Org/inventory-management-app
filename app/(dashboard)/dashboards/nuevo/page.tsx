import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { DashboardWorkspace } from "@/components/dashboards/dashboard-workspace"

export const dynamic = "force-dynamic"

export default async function NewDashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "admin") redirect("/")
  return <DashboardWorkspace />
}
