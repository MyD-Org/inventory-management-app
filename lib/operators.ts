import { sql } from "@/lib/database"
import { isAdmin } from "@/lib/roles"
import type { Operator } from "@/lib/operators-types"

// Los operarios del depósito: las personas que físicamente mueven el material.
//
// NO son usuarios del sistema y no tienen login, a propósito. La tablet del
// depósito tiene una sola sesión abierta todo el día; pedirle a cada uno que
// cierre y abra sesión para descontar tres tornillos garantiza que nadie lo
// haga. El operario se elige de una lista con un toque y firma el movimiento,
// mientras la sesión sigue siendo la que da (o no) el permiso.
//
// Acá viven las CONSULTAS (las llama el server). Las altas y bajas están en
// lib/operators-actions.ts, que es un "use server" y lo importa el cliente.
// Ojo de no confundir ese archivo con lib/operator-actions.ts (singular), que
// es otra cosa: revertir un movimiento de stock.

export async function listOperators(): Promise<Operator[]> {
    const rows = (await sql`
        SELECT id, name, active FROM operators ORDER BY active DESC, lower(name) ASC
    `) as any[]
    return rows.map((r) => ({ id: r.id, name: r.name, active: r.active }))
}

/** Los que se ofrecen en el modal. Los desactivados no se listan pero siguen
 *  nombrados en el histórico. */
export async function listActiveOperators(): Promise<Operator[]> {
    const rows = (await sql`
        SELECT id, name, active FROM operators WHERE active = TRUE ORDER BY lower(name) ASC
    `) as any[]
    return rows.map((r) => ({ id: r.id, name: r.name, active: r.active }))
}

/**
 * Valida un operario para firmar un movimiento y devuelve su nombre. Se llama
 * SIEMPRE en el servidor antes de escribir: el id llega del cliente y no se le
 * cree, igual que no se le cree el user_name.
 */
export async function resolveOperator(
    operatorId: unknown,
): Promise<{ id: number; name: string } | { error: string }> {
    const id = Number(operatorId)
    if (!Number.isInteger(id) || id <= 0) return { error: "Falta indicar quién hace el movimiento" }

    const [row] = (await sql`
        SELECT id, name FROM operators WHERE id = ${id} AND active = TRUE
    `) as any[]
    if (!row) return { error: "El operario no existe o está desactivado" }
    return { id: row.id, name: row.name }
}

/**
 * La regla completa de "¿quién hizo esto?", en un solo lugar porque la aplican
 * cuatro caminos (el modal de entrada/salida, el ajuste, el descuento por
 * pedido y la devolución) y tienen que coincidir.
 *
 * SOLO SE LE PIDE AL OPERADOR. El admin entra con su cuenta propia y
 * `user_name` ya dice quién es; preguntarle además "¿quién lo hace?" es pedirle
 * dos veces el mismo dato. El problema que resuelve el operario es el del
 * depósito: una tablet con una sesión compartida que nadie cambia.
 *
 * Para el operador es OBLIGATORIO en cuanto haya alguien cargado, y la regla
 * vive en el servidor y no solo en los formularios: si se puede saltear, se
 * saltea. La excepción es la lista vacía — una instalación donde todavía nadie
 * cargó operarios sigue moviendo stock como antes en vez de quedarse trabada.
 *
 * Si un admin igual manda un operario (porque estaba usando la tablet del
 * depósito), se respeta: el dato es mejor que la ausencia del dato.
 */
export async function requireOperator(
    operatorId: unknown,
    role?: string | null,
): Promise<{ operario: { id: number; name: string } | null } | { error: string }> {
    if (operatorId === undefined || operatorId === null || operatorId === "") {
        if (isAdmin(role)) return { operario: null }
        const hay = (await listActiveOperators()).length > 0
        return hay ? { error: "Falta indicar quién hace el movimiento" } : { operario: null }
    }
    const resuelto = await resolveOperator(operatorId)
    if ("error" in resuelto) return { error: resuelto.error }
    return { operario: resuelto }
}

/**
 * Si a esta sesión hay que preguntarle el operario. Lo consulta el selector
 * para no dibujarse en la pantalla del admin, y es la misma condición que
 * aplica requireOperator() del lado de la escritura.
 */
export async function operatorApplies(role?: string | null): Promise<boolean> {
    if (isAdmin(role)) return false
    return (await listActiveOperators()).length > 0
}
