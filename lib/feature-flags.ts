import "server-only"
import { flag } from "flags/next"
import { vercelAdapter } from "@flags-sdk/vercel"

// Feature flags de producto, servidos por Vercel Flags (nativo del dashboard: Flags →
// Create Flag). Se togglean ahí, por entorno (Development/Preview/Production), sin
// redeploy y sin envs por flag — solo requiere la env FLAGS (SDK Key), que Vercel inyecta
// sola al crear el proyecto. En local: `vercel link && vercel env pull`.
//
// La key del flag en el dashboard debe ser exactamente "ai-dashboards" (kebab-case, como
// usa la UI de Vercel Flags).
export const aiDashboardsFlag = flag<boolean>({
  key: "ai-dashboards",
  adapter: vercelAdapter(),
  description: "Dashboards IA (AI dashboard builder) en el menú de Análisis",
})

export const aiWidgetFlag = flag<boolean>({
  key: "ai-widget",
  adapter: vercelAdapter(),
  description: "Asistente IA (chat drawer) montado globalmente para admins",
})

export type FlagKey = "ai_dashboards" | "ai_widget"

/** Mapa de flags conocidos, para pasar a componentes cliente (ej. AppShell). */
export async function getFlags(): Promise<Record<FlagKey, boolean>> {
  const [ai_dashboards, ai_widget] = await Promise.all([aiDashboardsFlag(), aiWidgetFlag()])
  return { ai_dashboards, ai_widget }
}
