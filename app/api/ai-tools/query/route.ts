import { NextResponse, type NextRequest } from "next/server"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { assertSelectOnly, dashboardsSql, withLimit } from "@/lib/dashboards"

// Tool `run_query` del agente dashboard-builder (ai-api): valida SQL ejecutándolo de
// verdad y explora valores antes de emitir un dashboard. Mismas defensas que
// /api/dashboards/query pero auth server-to-server (INTERNAL_SECRET) y tope bajo de
// filas (es para validar/explorar, no para servir el dashboard).
export async function POST(request: NextRequest) {
  const unauthorized = requireInternalSecret(request)
  if (unauthorized) return unauthorized

  let body: { source?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (typeof body.source !== "string" || !body.source.trim()) {
    return NextResponse.json({ error: "Falta source" }, { status: 400 })
  }

  let source: string
  try {
    source = withLimit(assertSelectOnly(body.source), 50)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "SQL inválido" }, { status: 400 })
  }

  try {
    const rows = await dashboardsSql.query(source, [])
    return NextResponse.json({ ok: true, rows })
  } catch (err) {
    // El mensaje de Postgres es la señal de auto-corrección del agente.
    const message = err instanceof Error ? err.message : "Error ejecutando la consulta"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
