"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardView, type DashboardDocument } from "@myd-org/sdui-dashboard"
import { ChatPanel } from "@myd-org/ai-widget/preset"
import "@myd-org/ai-widget/styles"
import { Button } from "@/components/ui/button"
import { Save, Loader2, Eye, Pencil } from "lucide-react"

// Workspace del AI dashboard builder: dashboard a la izquierda, chat a la derecha.
// El agente (ai-api, kind dashboard_builder) emite el documento completo por SSE
// (evento `dashboard` → onEvent); las queries SQL del documento se ejecutan contra
// /api/dashboards/query. Ver docs/2026-07-10-plan-ai-dashboards.md.
export function DashboardWorkspace({
  dashboardId,
  initialDocument = null,
}: {
  dashboardId?: number
  initialDocument?: DashboardDocument | null
}) {
  const router = useRouter()
  const [document, setDocument] = useState<DashboardDocument | null>(initialDocument)
  // Como en nullplatform: la edición es el estado default del builder; preview es el opt-in.
  const [preview, setPreview] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // getPageContext se evalúa por envío: ref para no reconfigurar el chat en cada emisión.
  const docRef = useRef<DashboardDocument | null>(initialDocument)
  docRef.current = document

  const executeQuery = useCallback(async (source: string, params: unknown[]) => {
    const res = await fetch("/api/dashboards/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, params }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
    return data.rows as Array<Record<string, unknown>>
  }, [])

  const chatConfig = useMemo(
    () => ({
      baseUrl: "/ai-api", // rewrite same-origin → ai-api (ver next.config.mjs)
      agentId: process.env.NEXT_PUBLIC_AI_DASHBOARD_AGENT_ID ?? "",
      kind: "dashboard_builder" as const,
      persist: "none" as const,
      fetchToken: async () => {
        const res = await fetch("/api/ai/token", { method: "POST" })
        if (!res.ok) throw new Error("No se pudo obtener el token de IA")
        return (await res.json()).token as string
      },
      getPageContext: () => docRef.current ?? undefined,
      onEvent: (name: string, payload: unknown) => {
        if (name === "dashboard") {
          setDocument(payload as DashboardDocument)
          setIsDirty(true)
        }
      },
    }),
    [],
  )

  const save = useCallback(async () => {
    const doc = docRef.current
    if (!doc) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(dashboardId ? `/api/dashboards/${dashboardId}` : "/api/dashboards", {
        method: dashboardId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: doc }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      setIsDirty(false)
      if (!dashboardId) router.replace(`/dashboards/${data.dashboard.id}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }, [dashboardId, router])

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 120px)" }}>
      <div className="min-w-0 flex-1 overflow-y-auto pr-1">
        <DashboardView
          document={document}
          executeQuery={executeQuery}
          editable={!preview}
          onDocumentChange={(doc) => {
            setDocument(doc)
            setIsDirty(true)
          }}
          header={
            document && (
              <div className="flex items-center gap-2">
                {saveError && <span className="text-sm text-red-600">{saveError}</span>}
                <Button variant={preview ? "default" : "outline"} size="sm" onClick={() => setPreview((v) => !v)}>
                  {preview ? <Pencil className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                  {preview ? "Seguir editando" : "Vista previa"}
                </Button>
                <Button onClick={save} disabled={saving || !isDirty} size="sm">
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  {isDirty ? "Guardar" : "Guardado"}
                </Button>
              </div>
            )
          }
        />
      </div>
      <div className="w-[380px] shrink-0">
        <ChatPanel config={chatConfig} variant="dock" />
      </div>
    </div>
  )
}
