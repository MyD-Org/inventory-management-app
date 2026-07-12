import { NextResponse, type NextRequest } from "next/server"
import { requireAutomationsSecret } from "@/lib/automations-auth"
import { assertSelectOnly, dashboardsSql, withLimit } from "@/lib/dashboards"

// Endpoint del contrato de automatizaciones (platform/contracts/automations.md):
// lo consume el motor de ai-api en cada evaluación. Body {sql} -> {rows}.
// Tope alto (10000) a diferencia de /api/ai-tools/query (50, pensado para el agente).
export async function POST(request: NextRequest) {
  const unauthorized = requireAutomationsSecret(request)
  if (unauthorized) return unauthorized

  let body: { sql?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (typeof body.sql !== "string" || !body.sql.trim()) {
    return NextResponse.json({ error: "Falta sql" }, { status: 400 })
  }

  let source: string
  try {
    source = withLimit(assertSelectOnly(body.sql), 10000)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "SQL inválido" }, { status: 400 })
  }

  try {
    const rows = await dashboardsSql.query(source, [])
    return NextResponse.json({ rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error ejecutando la consulta"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
