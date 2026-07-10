"use client"

import { useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ChatDrawer } from "@myd-org/ai-widget/preset"
import type { BudgetCard } from "@myd-org/ai-widget"
import "@myd-org/ai-widget/styles"

// Clave de sessionStorage donde se deja el borrador que genera la IA (BudgetCard)
// para que /costos/nuevo lo precargue. Ver components/budget-editor.
export const BUDGET_DRAFT_KEY = "avantec-budget-draft"

// Igual pero para COTIZACIONES a clientes (presupuestos). La misma card del widget se
// reutiliza; se distingue por el subtitle "Cotización". Ver components/quote-editor.
export const QUOTE_DRAFT_KEY = "avantec-quote-draft"

// Asistente de IA flotante (burbuja abajo a la derecha). Consultas de inventario +
// presupuestos de fabricación. El token de sesión se mintea server-side en
// /api/ai/token (el API key del tenant nunca llega al browser).
export function AiAssistant() {
  const router = useRouter()

  const config = useMemo(
    () => ({
      baseUrl: "/ai-api", // rewrite same-origin → ai-api (ver next.config.mjs)
      agentId: process.env.NEXT_PUBLIC_AI_AGENT_ID ?? "",
      fetchToken: async () => {
        const res = await fetch("/api/ai/token", { method: "POST" })
        if (!res.ok) throw new Error("No se pudo obtener el token de IA")
        const data = await res.json()
        return data.token as string
      },
    }),
    [],
  )

  // "Abrir en el editor": según la card, abre el editor de COSTOS o el de COTIZACIONES.
  // La card de cotización se distingue por su subtitle ("Cotización…"); en ese caso las
  // líneas son PRODUCTOS costeados (materialId = id del producto) con su precio de venta.
  const onUseBudget = useCallback(
    async (card: BudgetCard) => {
      const notifyEditor = (evt: string) => {
        if (typeof window !== "undefined") {
          setTimeout(() => window.dispatchEvent(new CustomEvent(evt)), 50)
        }
      }

      // ── Cotización a cliente (DESACTIVADO) ────────────────────────────────
      // Presupuestos está oculto: la IA no debe abrir el editor de cotizaciones.
      // Si llega una card de cotización (el agente externo aún podría emitirla), se
      // ignora en vez de navegar a /presupuestos. Para reactivar, restaurar este ramal
      // y la entrada del menú en components/app-shell.tsx.
      if ((card.subtitle ?? "").toLowerCase().includes("cotiz")) {
        return
      }

      // ── Costo de fabricación ──────────────────────────────────────────────
      try {
        sessionStorage.setItem(
          BUDGET_DRAFT_KEY,
          JSON.stringify({
            title: card.title,
            lines: card.lines.map((l) => ({
              materialId: l.materialId ?? null,
              label: l.label,
              qty: l.qty ?? 1,
              unitPrice: l.unitPrice ?? 0,
            })),
          }),
        )
      } catch {
        // sessionStorage lleno/bloqueado: navegamos igual, el editor queda vacío.
      }
      try {
        const res = await fetch(`/api/budgets/find?name=${encodeURIComponent(card.title)}`)
        const data = await res.json()
        if (data?.id) {
          router.push(`/costos/${data.id}`) // existe → abrir y agregar
          notifyEditor("avantec:budget-draft")
          return
        }
      } catch {
        // si falla la búsqueda, seguimos con "nuevo"
      }
      router.push("/costos/nuevo")
      notifyEditor("avantec:budget-draft")
    },
    [router],
  )

  if (!process.env.NEXT_PUBLIC_AI_AGENT_ID) return null

  return (
    <ChatDrawer
      config={config}
      branding={{
        title: "Asistente New Avantec",
        subtitle: "Inventario y costos de fabricación",
        primaryColor: "#2563eb",
        launcherPosition: "bottom-right",
      }}
      labels={{
        headerTitle: "Asistente New Avantec",
        emptyState: "Preguntame por stock, movimientos o pedime el costo de fabricar algo.",
        useBudgetLabel: "Abrir en el editor",
      }}
      showActivity
      enableNewConversation
      onUseBudget={onUseBudget}
    />
  )
}
