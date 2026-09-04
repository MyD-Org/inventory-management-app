// Redirige el driver al Postgres local cuando NEON_LOCAL_PROXY está seteada.
// Sin este import la ruta intenta hablar con Neon y falla ("fetch failed").
import "@/lib/neon-local"
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
    // En desarrollo devolvemos también el detalle: el 500 llegaba al cliente como
    // "no hay nada cargado" y la causa quedaba solo en la consola del server.
    return NextResponse.json(
      {
        error: "Error al obtener proveedores",
        detail: process.env.NODE_ENV === "production" ? undefined : String(error),
      },
      { status: 500 }
    )
  }
}
