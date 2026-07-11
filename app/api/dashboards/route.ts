import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/database"

// CRUD de dashboards IA (la definición JSON; los datos se recalculan en runtime).

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const rows = await sql`
    SELECT id, name, created_by, created_at, updated_at
    FROM dashboards ORDER BY updated_at DESC
  `
  return NextResponse.json({ dashboards: rows })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  let body: { name?: unknown; document?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const document = body.document
  if (!document || typeof document !== "object") {
    return NextResponse.json({ error: "Falta document" }, { status: 400 })
  }
  const name =
    (typeof body.name === "string" && body.name.trim()) ||
    ((document as { meta?: { name?: string } }).meta?.name ?? "Dashboard")

  const [row] = await sql`
    INSERT INTO dashboards (name, document, created_by)
    VALUES (${name}, ${JSON.stringify(document)}::jsonb, ${session.user.email ?? session.user.id ?? null})
    RETURNING id, name, created_at, updated_at
  `
  return NextResponse.json({ dashboard: row }, { status: 201 })
}
