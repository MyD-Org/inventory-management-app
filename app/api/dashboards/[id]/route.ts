import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/database"

function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const id = parseId(params.id)
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 })
  const [row] = await sql`SELECT * FROM dashboards WHERE id = ${id}`
  if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  return NextResponse.json({ dashboard: row })
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const id = parseId(params.id)
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 })

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
    UPDATE dashboards
    SET name = ${name}, document = ${JSON.stringify(document)}::jsonb, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, name, created_at, updated_at
  `
  if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  return NextResponse.json({ dashboard: row })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const id = parseId(params.id)
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 })
  await sql`DELETE FROM dashboards WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
