"use client"

import { Fragment, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AutomationActionResult, AutomationEvent } from "./automation-types"

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
}

const KIND_LABEL: Record<AutomationEvent["kind"], string> = {
  enter: "Disparo",
  remind: "Recordatorio",
}

function ActionResultBadge({ result }: { result: AutomationActionResult }) {
  const variant = result.status === "sent" ? "outline" : result.status === "failed" ? "destructive" : "secondary"
  const extraClass =
    result.status === "sent" ? "text-green-700 border-green-300 dark:text-green-300 dark:border-green-800" : ""
  return (
    <Badge variant={variant} className={extraClass} title={result.detail}>
      {result.type}: {result.status}
    </Badge>
  )
}

// Tabla de eventos de automatización. Se usa tanto en /automations/[id] (eventos de
// UNA automatización) como en /automations/actividad (eventos globales, con
// `automationNames` resuelto server-side desde el listado ya fetcheado).
export function AutomationEvents({
  events,
  automationNames,
}: {
  events: AutomationEvent[]
  automationNames?: Record<string, string>
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay eventos registrados.</p>
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Fecha</TableHead>
            {automationNames && <TableHead>Automatización</TableHead>}
            <TableHead>Entidad</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <Fragment key={event.id}>
              <TableRow className="cursor-pointer" onClick={() => toggle(event.id)}>
                <TableCell>
                  {expanded.has(event.id) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>{formatDateTime(event.firedAt)}</TableCell>
                {automationNames && (
                  <TableCell className="text-sm">{automationNames[event.automationId] ?? event.automationId}</TableCell>
                )}
                <TableCell className="font-medium">{event.entityKey}</TableCell>
                <TableCell>{KIND_LABEL[event.kind]}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {event.actionsResult.map((result, i) => (
                      <ActionResultBadge key={i} result={result} />
                    ))}
                  </div>
                </TableCell>
              </TableRow>
              {expanded.has(event.id) && (
                <TableRow>
                  <TableCell colSpan={automationNames ? 6 : 5} className="bg-muted/30">
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(event.rowSnapshot, null, 2)}
                    </pre>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
