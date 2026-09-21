// Fechas de entrega del pedido. Vive fuera de components/orders-board.tsx, que es
// "use client": una función exportada desde un módulo de cliente no se puede
// LLAMAR desde un Server Component, y la vista de producción se arma en el server.

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

export function formatDate(d: string | null): string | null {
    if (!d) return null
    // Viene como "2026-09-05": lo parseamos a mano porque new Date("2026-09-05")
    // es medianoche UTC y en Argentina mostraría el día anterior.
    const [, m, day] = d.split("-").map(Number)
    return `${String(day).padStart(2, "0")} ${MONTHS_SHORT[m - 1]}`
}

// Entrega vencida: la fecha ya pasó y el pedido todavía no salió.
export function isOverdue(d: string | null, status: string): boolean {
    if (!d || status === "retirado" || status === "cancelado") return false
    const [y, m, day] = d.split("-").map(Number)
    const eta = new Date(y, m - 1, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return eta < today
}
