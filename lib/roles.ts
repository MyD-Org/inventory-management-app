// Los tres roles del sistema, en un solo lugar. Antes cada pantalla comparaba
// contra el string "admin" y alcanzaba, porque había dos roles y todo lo que no
// era admin era operador. Con el tercero eso deja de ser cierto: quien mira
// pedidos NO es un operador con menos permisos, es otra cosa.
//
//   admin     todo.
//   operator  el inventario del depósito: carga y descuenta stock.
//   pedidos   SOLO el módulo de pedidos, y de lectura para el stock: ve qué
//             materiales necesita cada pedido, pero no los descuenta.
export type Role = "admin" | "operator" | "pedidos"

export const ROLES: { value: Role; label: string; hint: string }[] = [
    { value: "operator", label: "Operador", hint: "Carga y descuenta stock del depósito" },
    { value: "pedidos", label: "Solo pedidos", hint: "Ve el módulo de pedidos; no descuenta materiales" },
    { value: "admin", label: "Administrador", hint: "Acceso completo" },
]

export function roleLabel(role?: string | null): string {
    return ROLES.find((r) => r.value === role)?.label ?? "Operador"
}

export function isRole(value: unknown): value is Role {
    return ROLES.some((r) => r.value === value)
}

export const isAdmin = (role?: string | null) => role === "admin"

/** Solo pedidos: fuera del módulo no tiene nada que hacer. */
export const isOrdersOnly = (role?: string | null) => role === "pedidos"

/**
 * Quién puede mover stock (descontar por un pedido, entradas, salidas y
 * ajustes). Se pregunta en el server ANTES de escribir, no solo al dibujar el
 * botón: el botón escondido no protege a la acción.
 */
export const canConsumeStock = (role?: string | null) => !isOrdersOnly(role)
