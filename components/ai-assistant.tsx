"use client"

import { useMemo, useCallback, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChatDrawer } from "@myd-org/ai-widget/preset"
import type { BudgetCard } from "@myd-org/ai-widget"
import "@myd-org/ai-widget/styles"

// Clave de sessionStorage donde se deja el borrador que genera la IA (BudgetCard)
// para que /fichas/nuevo lo precargue. Ver components/budget-editor.
export const BUDGET_DRAFT_KEY = "avantec-budget-draft"

// Igual pero para COTIZACIONES a clientes (presupuestos). La misma card del widget se
// reutiliza; se distingue por el subtitle "Cotización". Ver components/quote-editor.
export const QUOTE_DRAFT_KEY = "avantec-quote-draft"

// Asistente de IA flotante (burbuja abajo a la derecha). Consultas de inventario +
// presupuestos de fabricación. El token de sesión se mintea server-side en
// /api/ai/token (el API key del tenant nunca llega al browser).
// Nombre legible de cada sección, por el primer segmento de la ruta. Lo lee el agente,
// así que va en las palabras del negocio y no en las del router.
const SCREEN_NAMES: Record<string, string> = {
  inventory: "inventario",
  materials: "materiales",
  stock: "stock",
  fichas: "fichas de costo",
  movimientos: "movimientos de stock",
  pedidos: "pedidos",
  presupuestos: "presupuestos",
  graficos: "gráficos",
  dashboards: "dashboards",
  automations: "automatizaciones",
  scan: "escaneo",
  settings: "configuración",
}

export function AiAssistant() {
  const router = useRouter()
  const pathname = usePathname()

  // El config se memoiza con deps vacías a propósito: recrearlo hace que el widget
  // rearme su cliente y su sesión. Para que getPageContext igual vea la ruta actual,
  // la leemos de un ref que se actualiza en cada render.
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

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
      // Contexto de la pantalla abierta, evaluado en CADA mensaje. Sirve para que el
      // asistente resuelva referencias sin nombre ("este pedido", "cuánto stock tiene
      // esto") sin que el usuario tenga que dictar el id.
      //
      // Mandamos IDENTIFICADORES, no datos: el agente ya tiene tools para consultar la
      // base, así que meterle el stock o el costo acá sería pagar tokens en cada turno
      // por algo que puede averiguar — y arriesgarse a mandarle un dato desactualizado.
      getPageContext: () => {
        const path = pathnameRef.current ?? "/"
        const segments = path.split("/").filter(Boolean)
        const seccion = segments[0] ?? ""
        return {
          ruta: path,
          pantalla: SCREEN_NAMES[seccion] ?? seccion ?? "inicio",
          // Rutas de detalle (/pedidos/123): el id deja que el agente resuelva la entidad
          // en foco con sus tools. Las rutas tipo /pedidos/nuevo no matchean y no mandan id.
          ...(segments[1] && /^\d+$/.test(segments[1]) ? { id: segments[1] } : {}),
        }
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
            // familyId no está en el tipo BudgetLine del widget, pero el widget emite la
            // card tal como la manda ai-api (no filtra campos), así que llega igual. Es
            // lo que distingue "costear con esta familia" de "costear con este material
            // fijo": ver el schema de build_budget en ai-api.
            lines: card.lines.map((l) => ({
              materialId: l.materialId ?? null,
              familyId: (l as { familyId?: number }).familyId ?? null,
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
          router.push(`/fichas/${data.id}`) // existe → abrir y agregar
          notifyEditor("avantec:budget-draft")
          return
        }
      } catch {
        // si falla la búsqueda, seguimos con "nuevo"
      }
      router.push("/fichas/nuevo")
      notifyEditor("avantec:budget-draft")
    },
    [router],
  )

  if (!process.env.NEXT_PUBLIC_AI_AGENT_ID) return null
  // En el AI dashboard builder (/dashboards) se usa el chat embebido (dock), no la
  // burbuja flotante global → la ocultamos ahí para no duplicar asistentes.
  if (pathname?.startsWith("/dashboards")) return null

  return (
    <ChatDrawer
      config={config}
      branding={{
        title: "Asistente New Avantec",
        subtitle: "Inventario, costos y ventas",
        primaryColor: "#2563eb",
        launcherPosition: "bottom-right",
      }}
      labels={{
        headerTitle: "Asistente New Avantec",
        emptyState: "Preguntame por stock, costos de fabricación, ventas o cobranzas.",
        useBudgetLabel: "Abrir en el editor",
      }}
      showActivity
      enableHistory
      onUseBudget={onUseBudget}
    />
  )
}
