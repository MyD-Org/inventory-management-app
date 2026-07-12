import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { aiApiAutomations } from "@/lib/ai-api-automations"
import { AutomationEvents } from "@/components/automations/automation-events"
import type { Automation, AutomationEvent } from "@/components/automations/automation-types"

export const dynamic = "force-dynamic"

// Actividad global: eventos de TODAS las automatizaciones del tenant. El nombre de
// cada una se resuelve con el listado (ya fetcheado server-side), evitando otro
// hop por automatización.
export default async function AutomationsActivityPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  const [automationsRes, eventsRes] = await Promise.all([
    aiApiAutomations("/v1/automations"),
    aiApiAutomations("/v1/automation-events?limit=100"),
  ])

  const automationsData = await automationsRes.json().catch(() => ({}))
  const automations: Automation[] = automationsRes.ok && Array.isArray(automationsData.automations) ? automationsData.automations : []
  const automationNames = Object.fromEntries(automations.map((a) => [a.id, a.name]))

  const eventsData = await eventsRes.json().catch(() => ({}))
  const events: AutomationEvent[] = eventsRes.ok && Array.isArray(eventsData.events) ? eventsData.events : []

  return (
    <main className="container mx-auto space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Actividad de automatizaciones</h1>
      <AutomationEvents events={events} automationNames={automationNames} />
    </main>
  )
}
