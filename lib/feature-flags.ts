import "server-only"
import { flag } from "flags/next"
import { vercelAdapter } from "@flags-sdk/vercel"

// Feature flags de producto, servidos por Vercel Flags (nativo del dashboard: Flags →
// Create Flag). Se togglean ahí, por entorno (Development/Preview/Production), sin
// redeploy y sin envs por flag — solo requiere el VERCEL_OIDC_TOKEN que Vercel inyecta
// sola en runtime. En local: `vercel link && vercel env pull`.
//
// La key del flag en el dashboard debe ser exactamente el string kebab-case ("ai-widget",
// "ai-dashboards"). `defaultValue: false` es crítico: si el runtime no puede resolver el
// flag (p. ej. cuando las flag definitions no están bakeadas en el build, algo que puede
// pasar en Next 14 con webpack — ver next.config.mjs), el SDK cae al default en vez de
// tirar y crashear el request.
export const aiDashboardsFlag = flag<boolean>({
  key: "ai-dashboards",
  adapter: vercelAdapter(),
  defaultValue: false,
  description: "Dashboards IA (AI dashboard builder) en el menú de Análisis",
})

export const aiWidgetFlag = flag<boolean>({
  key: "ai-widget",
  adapter: vercelAdapter(),
  defaultValue: false,
  description: "Asistente IA (chat drawer) montado globalmente para admins",
})

export type FlagKey = "ai_dashboards" | "ai_widget"

/**
 * Mapa de flags conocidos, para pasar a componentes cliente (ej. AppShell).
 *
 * Envuelto en try/catch como red de seguridad extra: si el SDK falla por algo
 * inesperado (más allá del defaultValue), preferimos devolver todo `false` antes
 * que romper el layout.
 */
export async function getFlags(): Promise<Record<FlagKey, boolean>> {
  // Override local: en dev no hay VERCEL_OIDC_TOKEN y todos los flags caen a false,
  // escondiendo los ítems de nav gateados. Con AI_FLAGS_LOCAL=true en .env.local se
  // fuerzan todos a true SOLO en esa máquina (no afecta Preview/Production).
  if (process.env.AI_FLAGS_LOCAL === "true") {
    return { ai_dashboards: true, ai_widget: true }
  }
  try {
    const [ai_dashboards, ai_widget] = await Promise.all([aiDashboardsFlag(), aiWidgetFlag()])
    return { ai_dashboards, ai_widget }
  } catch {
    return { ai_dashboards: false, ai_widget: false }
  }
}
