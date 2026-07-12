import { type NextRequest } from "next/server"
import { aiApiAutomations, proxyJson, requireAdmin } from "@/lib/ai-api-automations"

type Ctx = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin()
  if (denied) return denied
  return proxyJson(await aiApiAutomations(`/v1/automations/${params.id}`))
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = await request.text()
  return proxyJson(await aiApiAutomations(`/v1/automations/${params.id}`, { method: "PATCH", body }))
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin()
  if (denied) return denied
  const res = await aiApiAutomations(`/v1/automations/${params.id}`, { method: "DELETE" })
  if (res.status === 204) return new Response(null, { status: 204 })
  return proxyJson(res)
}
