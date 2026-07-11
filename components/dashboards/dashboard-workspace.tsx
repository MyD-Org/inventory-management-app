"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardView, type DashboardDocument } from "@myd-org/sdui-dashboard"
import { ChatPanel } from "@myd-org/ai-widget/preset"
import "@myd-org/ai-widget/styles"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Save, Loader2, Eye, Pencil, PanelRightClose, PanelRightOpen, MessageSquare } from "lucide-react"

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
  // El agente está generando/editando (status 'streaming' del chat) → skeletons/overlay.
  const [generating, setGenerating] = useState(false)
  // Chat colapsable a un rail fino para ver mejor el dashboard.
  const [chatCollapsed, setChatCollapsed] = useState(false)
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
      // 'streaming' mientras el agente trabaja → prende los skeletons/overlay del dashboard.
      onStatus: (status: "idle" | "streaming" | "error") => {
        setGenerating(status === "streaming")
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
    // Llena exacto el alto bajo el topbar (h-14 = 3.5rem, sticky en flujo): sin banda muerta.
    // El padding va SOLO en la columna del dashboard (para que respire); el dock queda flush
    // a top/right/bottom (patrón dock: solo borde izquierdo) y usa todo el espacio disponible.
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <DashboardView
          document={document}
          executeQuery={executeQuery}
          editable={!preview}
          generating={generating}
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

      {/* Chat colapsable. El panel queda SIEMPRE montado (oculto con `hidden` al colapsar)
          para no perder la conversación; el rail fino permite re-expandir. */}
      <aside
        className={cn(
          "relative shrink-0 transition-[width] duration-200 ease-out",
          chatCollapsed ? "w-12" : "w-[380px]",
        )}
      >
        {chatCollapsed && (
          <button
            type="button"
            onClick={() => setChatCollapsed(false)}
            title="Expandir asistente"
            aria-label="Expandir asistente"
            className="flex h-full w-12 flex-col items-center gap-4 border-l bg-card pt-3 text-muted-foreground transition-colors hover:text-foreground"
          >
            <PanelRightOpen className="h-5 w-5" />
            <MessageSquare className="h-5 w-5" />
          </button>
        )}
        <div className={cn("relative h-full", chatCollapsed && "hidden")}>
          <button
            type="button"
            onClick={() => setChatCollapsed(true)}
            title="Colapsar asistente"
            aria-label="Colapsar asistente"
            className="absolute right-2 top-2.5 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
          <ChatPanel config={chatConfig} variant="dock" />
        </div>
      </aside>
    </div>
  )
}
