// Validación y totales de gastos. Funciones puras (sin base de datos) para
// poder testearlas con vitest; las server actions de lib/gastos-actions.ts
// las usan antes de tocar la base.

export const PAYMENT_METHODS = [
    { value: "efectivo", label: "Efectivo" },
    { value: "transferencia", label: "Transferencia" },
    { value: "tarjeta", label: "Tarjeta" },
    { value: "otro", label: "Otro" },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"]

const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value) as string[]

export interface CategoriaGasto {
    id: number
    name: string
    active: boolean
}

export interface GastoRow {
    id: number
    expense_date: string // YYYY-MM-DD
    description: string
    amount: string // numeric(12,2): el driver lo entrega como string
    payment_method: string
    category_id: number
    category_name: string
}

export interface ExpenseInput {
    expense_date: string
    category_id: number
    description: string
    amount: number | string
    payment_method: string
}

// activeCategoryIds: categorías que se pueden elegir en el alta.
// allowInactiveCategoryId: en edición, la categoría actual del gasto se acepta
// aunque haya sido desactiva después de cargarlo (no se fuerza a recategorizar).
export function validateExpense(
    input: ExpenseInput,
    opts: { activeCategoryIds: number[]; allowInactiveCategoryId?: number | null }
): string[] {
    const errors: string[] = []

    if (!input.description?.trim()) errors.push("La descripción es obligatoria")

    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) errors.push("El monto tiene que ser un número mayor a 0")

    const date = input.expense_date ?? ""
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push("La fecha es obligatoria")
    } else {
        const today = new Date()
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
            today.getDate()
        ).padStart(2, "0")}`
        if (date > todayStr) errors.push("La fecha no puede ser futura")
    }

    const permitida =
        opts.activeCategoryIds.includes(input.category_id) ||
        input.category_id === (opts.allowInactiveCategoryId ?? null)
    if (!permitida) errors.push("Elegí una categoría activa")

    if (!PAYMENT_METHOD_VALUES.includes(input.payment_method)) errors.push("Medio de pago inválido")

    return errors
}

export interface TotalPorCategoria {
    category_id: number
    nombre: string
    monto: number
    pct: number
}

// Barras del resumen mensual: suma por categoría, orden descendente por monto
// y porcentaje sobre el total del mes.
export function totalesPorCategoria(
    expenses: { category_id: number; category_name: string; amount: number | string }[]
): TotalPorCategoria[] {
    const porCategoria = new Map<number, TotalPorCategoria>()
    let total = 0
    for (const e of expenses) {
        const monto = Number(e.amount)
        if (!Number.isFinite(monto)) continue
        total += monto
        const actual = porCategoria.get(e.category_id)
        if (actual) {
            actual.monto += monto
        } else {
            porCategoria.set(e.category_id, { category_id: e.category_id, nombre: e.category_name, monto, pct: 0 })
        }
    }
    return Array.from(porCategoria.values())
        .map((t) => ({ ...t, pct: total > 0 ? t.monto / total : 0 }))
        .sort((a, b) => b.monto - a.monto)
}

export function labelMedioPago(value: string): string {
    return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value
}

// "2026-09-05" -> "05/09" para la columna fecha del detalle.
export function formatearFechaCorta(date: string): string {
    const [, m, d] = date.split("-")
    return `${d}/${m}`
}
