import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { assertSelectOnly, dashboardsSql, withLimit } from "@/lib/dashboards"

// Ejecuta una query de un dashboard IA (SQL generado por el agente + params bindeados a
// filtros). Es el MISMO camino que usa el agente para validar su SQL (tool run_query).
// Defensas: auth admin, SELECT-only, un solo statement, LIMIT forzado y (en prod)
// DASHBOARDS_DATABASE_URL apuntando a un rol read-only.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  let body: { source?: unknown; params?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (typeof body.source !== "string" || !body.source.trim()) {
    return NextResponse.json({ error: "Falta source" }, { status: 400 })
  }
  const params = Array.isArray(body.params) ? body.params : []

  let source: string
  try {
    source = withLimit(assertSelectOnly(body.source))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "SQL inválido" }, { status: 400 })
  }

  try {
    const rows = await dashboardsSql.query(source, params)
    return NextResponse.json({ rows })
  } catch (err) {
    // El mensaje de Postgres vuelve al cliente: lo usa el agente para auto-corregirse
    // (tool run_query) y el widget para mostrar el error inline en el dashboard.
    const message = err instanceof Error ? err.message : "Error ejecutando la consulta"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
