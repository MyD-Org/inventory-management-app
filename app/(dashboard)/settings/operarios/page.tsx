import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { auth } from "@/auth"
import { listOperators } from "@/lib/operators"
import { OperatorsManager } from "@/components/operators-manager"

export const dynamic = "force-dynamic"

// La gente del depósito. Se cargan acá, se eligen en el modal de entrada y
// salida, y quedan firmando cada movimiento en el histórico.
//
// Por qué no son usuarios: un usuario tiene login, y el punto de todo esto es
// justamente que en la terminal compartida nadie va a cambiar de sesión para
// mover stock. Ver lib/operators.ts.
export default async function OperariosPage() {
    const session = await auth()
    if (session?.user?.role !== "admin") redirect("/")

    const operators = await listOperators()

    return (
        <div className="mx-auto w-full max-w-2xl px-8 py-6">
            <div className="mb-4 flex items-center gap-1.5 text-base text-muted-foreground">
                <Link href="/settings" className="hover:text-foreground">
                    Configuración
                </Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-foreground">Operarios</span>
            </div>
            <h1 className="mb-2 text-2xl font-bold">Operarios</h1>
            <p className="mb-6 text-sm text-muted-foreground">
                Quiénes pueden figurar como responsables de una entrada o una salida de stock. Al
                registrar un movimiento se elige uno de esta lista, y el nombre queda guardado en el
                historial.
            </p>
            <OperatorsManager operators={operators} />
        </div>
    )
}
