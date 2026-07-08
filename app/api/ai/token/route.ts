import { NextResponse } from "next/server"
import { auth } from "@/auth"

// Mintea un token de sesión de ai-api para el usuario logueado (lo consume el widget
// vía fetchToken). El API key del tenant (ak_…) vive SOLO en el server: el browser
// recibe únicamente el JWT corto de sesión.
export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
  // El asistente es solo para administradores (defensa server-side además del gate de UI).
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  const baseUrl = process.env.AI_API_BASE_URL
  const apiKey = process.env.AVANTEC_AI_API_KEY
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "Asistente de IA no configurado" }, { status: 503 })
  }

  try {
    const res = await fetch(`${baseUrl}/v1/end-user-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        external_id: session.user.id || session.user.email || "avantec-user",
        display_name: session.user.name || undefined,
      }),
      cache: "no-store",
    })

    if (!res.ok) {
      console.error("ai-api end-user-sessions failed:", res.status)
      return NextResponse.json({ error: "No se pudo iniciar la sesión de IA" }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({ token: data.token, expires_at: data.expires_at })
  } catch (error) {
    console.error("Error minting AI session token:", error)
    return NextResponse.json({ error: "No se pudo conectar con el asistente" }, { status: 502 })
  }
}
