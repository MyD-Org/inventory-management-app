import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    const suppliers = await sql`
      SELECT id, name, contact_person, email, phone FROM suppliers ORDER BY name
    `
    return NextResponse.json(suppliers)
  } catch (error) {
    console.error("Error fetching suppliers:", error)
    return NextResponse.json({ error: "Error al obtener proveedores" }, { status: 500 })
  }
}
