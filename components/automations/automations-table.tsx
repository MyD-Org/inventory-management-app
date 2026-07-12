"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Bell, Pause, Play, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Automation } from "./automation-types"

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
}

function StatusBadge({ automation }: { automation: Automation }) {
  if (automation.pausedReason) {
    return (
      <Badge variant="destructive" title={`Auto-pausada: ${automation.pausedReason}`}>
        Auto-pausada
      </Badge>
    )
  }
  if (!automation.enabled) {
    return <Badge variant="secondary">Pausada</Badge>
  }
  return (
    <Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-300 dark:border-green-800">
      Activa
    </Badge>
  )
}

export function AutomationsTable({ automations }: { automations: Automation[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function togglePaused(automation: Automation) {
    setPendingId(automation.id)
    try {
      const res = await fetch(`/api/automations/${automation.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !automation.enabled }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      toast.success(automation.enabled ? "Automatización pausada" : "Automatización reanudada")
      router.refresh()
    } catch (err) {
      toast.error("No se pudo cambiar el estado", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setPendingId(null)
    }
  }

  async function doDelete(automation: Automation) {
    if (!confirm(`¿Eliminar la automatización "${automation.name}"? Esta acción no se puede deshacer.`)) return
    setPendingId(automation.id)
    try {
      const res = await fetch(`/api/automations/${automation.id}`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Error ${res.status}`)
      }
      toast.success("Automatización eliminada")
      router.refresh()
    } catch (err) {
      toast.error("No se pudo eliminar", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setPendingId(null)
    }
  }

  if (automations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Bell className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            Todavía no hay automatizaciones. Creá la primera para recibir alertas cuando tus datos crucen un umbral.
          </p>
          <Button asChild>
            <Link href="/automations/nuevo">Nueva automatización</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Última evaluación</TableHead>
            <TableHead>Próxima</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {automations.map((automation) => (
            <TableRow key={automation.id}>
              <TableCell className="font-medium">
                <Link href={`/automations/${automation.id}`} className="hover:underline">
                  {automation.name}
                </Link>
              </TableCell>
              <TableCell>
                <StatusBadge automation={automation} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                {formatDateTime(automation.lastRunAt)}
                {automation.lastRunStatus ? ` · ${automation.lastRunStatus === "ok" ? "ok" : "error"}` : ""}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>{formatDateTime(automation.nextRunAt)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pendingId === automation.id}
                    onClick={() => togglePaused(automation)}
                    title={automation.enabled ? "Pausar" : "Reanudar"}
                  >
                    {automation.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" asChild title="Editar">
                    <Link href={`/automations/${automation.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pendingId === automation.id}
                    onClick={() => doDelete(automation)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
