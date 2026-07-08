import { NextResponse, type NextRequest } from "next/server"

// Guard de los endpoints /api/ai-tools/* que consume el agente de IA (ai-api).
// Auth server-to-server: Authorization: Bearer <INTERNAL_SECRET> (el mismo secreto
// que se cifró en las tools del tenant Avantec en ai-api, ver scripts/seed-avantec.ts).
// Estos endpoints son SOLO LECTURA y no pasan por next-auth (middleware excluye /api).
export function requireInternalSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_SECRET
  if (!secret) {
    return NextResponse.json({ error: "INTERNAL_SECRET no configurado" }, { status: 503 })
  }
  const header = request.headers.get("authorization") ?? ""
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  return null
}

// Parseo defensivo de límites (los params de la tool pueden venir vacíos o raros).
export function parseLimit(value: string | null, fallback: number, max = 50): number {
  const n = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(n, max)
}
