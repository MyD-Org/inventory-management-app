"use client"

import { useState } from "react"
import { Bell, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { describeAutomation, type AutomationInput } from "./automation-types"

// Propuesta emitida por el agente (evento SSE `automation`). El emit NO crea nada:
// se persiste recién cuando el usuario confirma acá (POST /api/automations).
export function AutomationProposalCard({
  proposal,
  onDone,
}: {
  proposal: AutomationInput
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    try {
      const isEdit = Boolean(proposal.id)
      const res = await fetch(isEdit ? `/api/automations/${proposal.id}` : "/api/automations", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...proposal, createdBy: "chat" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const details = Array.isArray(data.details) ? `: ${data.details.join("; ")}` : ""
        throw new Error(`${data.error ?? "error"}${details}`)
      }
      toast.success(isEdit ? "Automatización actualizada" : "Automatización creada", {
        description: proposal.name,
      })
      onDone()
    } catch (err) {
      toast.error("No se pudo crear la automatización", {
        description: err instanceof Error ? err.message : undefined,
      })
      setSaving(false)
    }
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          {proposal.id ? "Actualizar automatización" : "Nueva automatización propuesta"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-medium">{proposal.name}</p>
        <p className="text-sm text-muted-foreground">{describeAutomation(proposal)}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={confirm} disabled={saving}>
            <Check className="mr-1 h-4 w-4" /> {proposal.id ? "Actualizar" : "Crear alerta"}
          </Button>
          <Button size="sm" variant="outline" onClick={onDone} disabled={saving}>
            <X className="mr-1 h-4 w-4" /> Descartar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
