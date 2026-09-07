'use server'

// Server actions de la sección de gastos. Mismo patrón que lib/order-actions.ts:
// auth() por acción, re-validación del rol admin (no se confía en la UI),
// resultado { error } | { ok: true }, revalidatePath al mutar.

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { sql } from '@/lib/database'
import { validateExpense, type ExpenseInput } from '@/lib/gastos'

export async function saveExpense(id: number | null, input: ExpenseInput) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    const categories = await sql`SELECT id, active FROM expense_categories`
    const activeIds = categories.filter((c) => c.active).map((c) => Number(c.id))

    // En edición, la categoría actual del gasto se acepta aunque esté inactiva.
    let allowInactiveCategoryId: number | null = null
    if (id !== null) {
        const rows = await sql`SELECT category_id FROM expenses WHERE id = ${id}`
        if (rows.length === 0) return { error: 'El gasto no existe' }
        allowInactiveCategoryId = Number(rows[0].category_id)
    }

    const errors = validateExpense(input, { activeCategoryIds: activeIds, allowInactiveCategoryId })
    if (errors.length > 0) return { error: errors.join('. ') }

    const createdBy = session.user.name ?? session.user.email ?? 'admin'

    try {
        if (id === null) {
            await sql`
                INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, created_by)
                VALUES (${input.expense_date}, ${input.category_id}, ${input.description.trim()},
                        ${input.amount}, ${input.payment_method}, ${createdBy})
            `
        } else {
            await sql`
                UPDATE expenses
                SET expense_date = ${input.expense_date},
                    category_id = ${input.category_id},
                    description = ${input.description.trim()},
                    amount = ${input.amount},
                    payment_method = ${input.payment_method}
                WHERE id = ${id}
            `
        }
        revalidatePath('/gastos')
        return { ok: true as const }
    } catch (error) {
        console.error('Error en saveExpense:', error)
        return { error: 'No se pudo guardar el gasto' }
    }
}

export async function deleteExpense(id: number) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    try {
        await sql`DELETE FROM expenses WHERE id = ${id}`
        revalidatePath('/gastos')
        return { ok: true as const }
    } catch (error) {
        console.error('Error en deleteExpense:', error)
        return { error: 'No se pudo borrar el gasto' }
    }
}

export async function createExpenseCategory(name: string) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    const trimmed = name?.trim() ?? ''
    if (!trimmed) return { error: 'El nombre no puede estar vacío' }

    try {
        const dup = await sql`
            SELECT id FROM expense_categories WHERE lower(name) = lower(${trimmed})
        `
        if (dup.length > 0) return { error: 'Ya existe una categoría con ese nombre' }

        const inserted = await sql`
            INSERT INTO expense_categories (name) VALUES (${trimmed}) RETURNING id
        `
        revalidatePath('/gastos')
        // El id vuelve para que el select que disparó el alta pueda
        // seleccionarla en el acto, sin esperar el refresh.
        return { ok: true as const, id: Number(inserted[0].id) }
    } catch (error) {
        console.error('Error en createExpenseCategory:', error)
        return { error: 'No se pudo crear la categoría' }
    }
}

export async function renameExpenseCategory(id: number, name: string) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    const trimmed = name?.trim() ?? ''
    if (!trimmed) return { error: 'El nombre no puede estar vacío' }

    try {
        await sql`UPDATE expense_categories SET name = ${trimmed} WHERE id = ${id}`
        revalidatePath('/gastos')
        return { ok: true as const }
    } catch (error) {
        console.error('Error en renameExpenseCategory:', error)
        return { error: 'No se pudo renombrar la categoría' }
    }
}

export async function setExpenseCategoryActive(id: number, active: boolean) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    try {
        await sql`UPDATE expense_categories SET active = ${active} WHERE id = ${id}`
        revalidatePath('/gastos')
        return { ok: true as const }
    } catch (error) {
        console.error('Error en setExpenseCategoryActive:', error)
        return { error: 'No se pudo actualizar la categoría' }
    }
}
