import { OperatorMovementsList } from "@/components/operator-movements-list"
import { listarMovimientosRecientes } from "@/lib/operator-movements-query"

// Los últimos movimientos en el inicio del operador. Se traen las dos listas
// —las suyas y las de todos— y el conmutador de la lista cambia entre una y
// otra sin recargar la página.
export async function OperatorRecentMovements({ userName }: { userName: string }) {
    const { propios, todos } = await listarMovimientosRecientes(userName)

    return <OperatorMovementsList propios={propios} todos={todos} />
}
