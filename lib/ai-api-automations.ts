import { NextResponse } from "next/server"
import { auth } from "@/auth"

// Proxy fino al CRUD /v1/automations de ai-api. La API key ak_ vive SOLO en server
// (mismo principio que /api/ai/token). El browser solo habla con estas rutas admin.
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 })
  return null
}

export async function aiApiAutomations(path: string, init?: RequestInit): Promise<Response> {
  const base = process.env.AI_API_BASE_URL
  const key = process.env.AVANTEC_AI_API_KEY
  if (!base || !key) {
    return Response.json({ error: "AI_API_BASE_URL/AVANTEC_AI_API_KEY no configuradas" }, { status: 503 })
  }
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })
}

// Passthrough: mismo status y body que devuelva ai-api.
export async function proxyJson(res: Response): Promise<NextResponse> {
  const body = await res.json().catch(() => ({ error: "respuesta inválida de ai-api" }))
  return NextResponse.json(body, { status: res.status })
}
