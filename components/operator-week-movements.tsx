import { OperatorMovementsList } from "@/components/operator-movements-list"
import { listarMovimientosDeLaSemana } from "@/lib/operator-movements-query"

// Los movimientos de la semana en el inicio del operador. La consulta trae los
// de todo el mundo y el filtro de la lista decide qué se muestra; el corte por
// usuario se hace en el cliente porque la semana entra holgada en una tanda y
// así el filtro es instantáneo, sin recargar la página.
export async function OperatorWeekMovements({ userName }: { userName: string }) {
    const movimientos = await listarMovimientosDeLaSemana(userName)

    return <OperatorMovementsList movimientos={movimientos} />
}
