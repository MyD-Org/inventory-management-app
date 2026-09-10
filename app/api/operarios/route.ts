import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { listActiveOperators, operatorApplies } from "@/lib/operators"

// La lista para el selector de "¿quién lo hace?". Se pide al abrir el
// formulario y no se pasa por props: así la tablet del depósito ve un operario
// nuevo apenas el admin lo carga, sin recargar la pantalla ni volver a entrar.
//
// `required` dice si a ESTA sesión hay que preguntarle. Al admin no: su cuenta
// ya lleva su nombre. Viene del servidor y no se deduce en el cliente para que
// sea la misma condición que aplica requireOperator() al escribir.
export async function GET() {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    try {
        const [operators, required] = await Promise.all([
            listActiveOperators(),
            operatorApplies(session.user.role),
        ])
        return NextResponse.json({ operators, required })
    } catch (error) {
        console.error("Error listando operarios:", error)
        return NextResponse.json({ error: "No se pudieron cargar los operarios" }, { status: 500 })
    }
}
