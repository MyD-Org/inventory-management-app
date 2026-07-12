import { type NextRequest } from "next/server"
import { aiApiAutomations, proxyJson, requireAdmin } from "@/lib/ai-api-automations"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  return proxyJson(await aiApiAutomations(`/v1/automations/${params.id}/runs`))
}
