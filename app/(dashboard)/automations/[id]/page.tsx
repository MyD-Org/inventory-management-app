import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import { aiApiAutomations } from "@/lib/ai-api-automations"
import { AutomationForm } from "@/components/automations/automation-form"
import { AutomationEvents } from "@/components/automations/automation-events"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Automation, AutomationEvent, AutomationRun } from "@/components/automations/automation-types"

export const dynamic = "force-dynamic"

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
}

const RUN_STATUS_LABEL: Record<AutomationRun["status"], string> = {
  running: "En curso",
  ok: "ok",
  error: "error",
}

export default async function AutomationDetailPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  const [automationRes, eventsRes, runsRes] = await Promise.all([
    aiApiAutomations(`/v1/automations/${params.id}`),
    aiApiAutomations(`/v1/automations/${params.id}/events`),
    aiApiAutomations(`/v1/automations/${params.id}/runs`),
  ])
  if (automationRes.status === 404) notFound()

  const automationData = await automationRes.json().catch(() => ({}))
  if (!automationRes.ok || !automationData.automation) notFound()
  const automation: Automation = automationData.automation

  const eventsData = await eventsRes.json().catch(() => ({}))
  const events: AutomationEvent[] = eventsRes.ok && Array.isArray(eventsData.events) ? eventsData.events : []

  const runsData = await runsRes.json().catch(() => ({}))
  const runs: AutomationRun[] = runsRes.ok && Array.isArray(runsData.runs) ? runsData.runs : []

  return (
    <main className="container mx-auto max-w-3xl space-y-8 px-4 py-6">
      <h1 className="text-2xl font-semibold">Editar automatización</h1>
      <AutomationForm automation={automation} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Eventos</h2>
        <AutomationEvents events={events} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Runs recientes</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se ejecutó ninguna evaluación.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Filas</TableHead>
                  <TableHead>Coincidencias</TableHead>
                  <TableHead>Disparos</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(run.startedAt)}</TableCell>
                    <TableCell>{RUN_STATUS_LABEL[run.status]}</TableCell>
                    <TableCell>{run.rowsReturned ?? "—"}</TableCell>
                    <TableCell>{run.matched ?? "—"}</TableCell>
                    <TableCell>{run.fired ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-destructive" title={run.error ?? undefined}>
                      {run.error ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  )
}
