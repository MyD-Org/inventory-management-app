import { type NextRequest } from "next/server"
import { aiApiAutomations, proxyJson, requireAdmin } from "@/lib/ai-api-automations"

// OJO: Este route está en app/api/automations/events/route.ts (estático).
// Convive con app/api/automations/[id]/... (dinámico).
// Next.js prioriza el route estático — GET /api/automations/events
// va a este archivo, no a [id]='events'.
export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const limit = request.nextUrl.searchParams.get("limit") ?? "50"
  return proxyJson(await aiApiAutomations(`/v1/automation-events?limit=${encodeURIComponent(limit)}`))
}
