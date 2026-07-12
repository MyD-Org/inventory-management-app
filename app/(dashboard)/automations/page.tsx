import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { aiApiAutomations } from "@/lib/ai-api-automations"
import { Button } from "@/components/ui/button"
import { AutomationsTable } from "@/components/automations/automations-table"
import type { Automation } from "@/components/automations/automation-types"
import { Activity, Plus } from "lucide-react"

export const dynamic = "force-dynamic"

// Listado de automatizaciones. Fetch server-side directo a ai-api (evita el hop
// extra por /api/automations) usando el mismo helper que expone el proxy admin.
export default async function AutomationsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  const res = await aiApiAutomations("/v1/automations")
  const data = await res.json().catch(() => ({}))
  const automations: Automation[] = res.ok && Array.isArray(data.automations) ? data.automations : []

  return (
    <main className="container mx-auto space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Automatizaciones</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/automations/actividad">
              <Activity className="mr-1 h-4 w-4" /> Actividad
            </Link>
          </Button>
          <Button asChild>
            <Link href="/automations/nuevo">
              <Plus className="mr-1 h-4 w-4" /> Nueva automatización
            </Link>
          </Button>
        </div>
      </div>

      <AutomationsTable automations={automations} />
    </main>
  )
}
