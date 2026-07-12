import { type NextRequest } from "next/server"
import { aiApiAutomations, proxyJson, requireAdmin } from "@/lib/ai-api-automations"

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return proxyJson(await aiApiAutomations("/v1/automations"))
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = await request.text()
  return proxyJson(await aiApiAutomations("/v1/automations", { method: "POST", body }))
}
