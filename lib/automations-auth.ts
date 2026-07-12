import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

// Guard server-to-server del motor de automatizaciones de ai-api.
// Mismo secreto compartido que las tools (INTERNAL_SECRET), registrado en ai-api
// vía PUT /v1/data-source. Header propio del contrato: x-automations-secret.
export function requireAutomationsSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_SECRET
  if (!secret) {
    return NextResponse.json({ error: "INTERNAL_SECRET no configurado" }, { status: 503 })
  }
  const header = request.headers.get("x-automations-secret") ?? ""
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  return null
}
