import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { listActiveOperators } from "@/lib/operators"

// La lista para el modal de entrada/salida. Se pide al abrir el modal y no se
// pasa por props: así la tablet del depósito ve un operario nuevo apenas el
// admin lo carga, sin recargar la pantalla ni volver a entrar.
export async function GET() {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    try {
        return NextResponse.json({ operators: await listActiveOperators() })
    } catch (error) {
        console.error("Error listando operarios:", error)
        return NextResponse.json({ error: "No se pudieron cargar los operarios" }, { status: 500 })
    }
}
