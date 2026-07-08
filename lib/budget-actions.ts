'use server';

// Server actions del módulo de costos de fabricación (recursos de mano de obra +
// cálculos de costo). Mismo patrón que lib/actions.ts: neon + auth() por acción,
// revalidatePath al mutar.

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';

const sql = neon(process.env.DATABASE_URL!);

// ── Recursos de mano de obra ─────────────────────────────────────────────────
// Un recurso puede ser un empleado propio, contratista, taller externo, instalador
// o servicio tercerizado. El costo se define por MES; el costo/hora se deriva con
// app_settings.work_hours_per_month (ver getWorkHoursPerMonth).

export async function createLaborResource(formData: FormData) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const name = (formData.get('name') as string)?.trim();
    const role = (formData.get('role') as string)?.trim() || null;
    const monthlyValue = Number.parseFloat(formData.get('monthly_value') as string);

    if (!name) return { error: 'El nombre es requerido' };
    if (!Number.isFinite(monthlyValue) || monthlyValue < 0) return { error: 'Valor por mes inválido' };

    try {
        await sql`INSERT INTO labor_resources (name, role, monthly_value) VALUES (${name}, ${role}, ${monthlyValue})`;
        revalidatePath('/settings/recursos');
        return { success: true };
    } catch (error) {
        console.error('Error creating labor resource:', error);
        return { error: 'Error al crear el recurso' };
    }
}

export async function updateLaborResource(id: number, formData: FormData) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const name = (formData.get('name') as string)?.trim();
    const role = (formData.get('role') as string)?.trim() || null;
    const monthlyValue = Number.parseFloat(formData.get('monthly_value') as string);
    const active = formData.get('active') === 'true';

    if (!name) return { error: 'El nombre es requerido' };
    if (!Number.isFinite(monthlyValue) || monthlyValue < 0) return { error: 'Valor por mes inválido' };

    try {
        await sql`
            UPDATE labor_resources
            SET name = ${name}, role = ${role}, monthly_value = ${monthlyValue}, active = ${active}
            WHERE id = ${id}
        `;
        revalidatePath('/settings/recursos');
        return { success: true };
    } catch (error) {
        console.error('Error updating labor resource:', error);
        return { error: 'Error al actualizar el recurso' };
    }
}

export async function deleteLaborResource(id: number) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    try {
        await sql`DELETE FROM labor_resources WHERE id = ${id}`;
        revalidatePath('/settings/recursos');
        return { success: true };
    } catch (error) {
        console.error('Error deleting labor resource:', error);
        return { error: 'No se puede eliminar: el recurso está usado en cálculos de costos' };
    }
}

// Horas laborales por mes para derivar el costo/hora de un recurso
// (costo/hora = monthly_value / work_hours_per_month). Default 206
// (L-V 8:00-17:30 = 9,5 h/día × ~21,7 días hábiles/mes).
export async function getWorkHoursPerMonth(): Promise<number> {
    try {
        const [row] = await sql`SELECT value FROM app_settings WHERE key = 'work_hours_per_month'`;
        const n = Number(row?.value);
        return Number.isFinite(n) && n > 0 ? n : 206;
    } catch {
        return 206;
    }
}

// ── Catálogo de materiales para el editor (con sesión, a diferencia de /api/ai-tools) ──
// Se trae el inventario completo una vez y el filtrado (difuso, sin acentos y tolerante a
// typos) se hace en el cliente con fuse.js — igual que el buscador de productos/recursos.
// El taller maneja unos cientos de materiales, así que el payload es chico.

export async function getMaterialsCatalog() {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' as const, materials: [] };

    try {
        const materials = await sql`
            SELECT m.id, m.name, m.barcode, m.unit_of_measure, m.unit_cost, i.available_stock
            FROM materials m
            JOIN inventory i ON i.material_id = m.id
            ORDER BY m.name ASC
        `;
        return { materials };
    } catch (error) {
        console.error('Error loading materials catalog:', error);
        return { error: 'Error al cargar los materiales' as const, materials: [] };
    }
}

// Costos vigentes para "actualizar precios" del editor: materials.unit_cost por id.
export async function getCurrentCosts(materialIds: number[]) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' as const, costs: {} as Record<number, number> };

    const ids = materialIds.filter((n) => Number.isFinite(n));
    if (ids.length === 0) return { costs: {} as Record<number, number> };

    try {
        const rows = await sql`
            SELECT id, unit_cost FROM materials WHERE id = ANY(${ids})
        `;
        const costs: Record<number, number> = {};
        for (const r of rows) costs[r.id as number] = Number(r.unit_cost);
        return { costs };
    } catch (error) {
        console.error('Error fetching current costs:', error);
        return { error: 'Error al traer costos' as const, costs: {} as Record<number, number> };
    }
}

// ── Presupuestos ─────────────────────────────────────────────────────────────

export interface BudgetPayload {
    name: string;
    description?: string;
    alegra_item_id?: number | null;
    status: 'draft' | 'final';
    margin_pct: number;
    materials: Array<{ material_id: number | null; label: string; qty: number; unit_cost: number }>;
    labor: Array<{ resource_id: number | null; label: string; hours: number; hourly_rate: number }>;
    extras: Array<{ label: string; amount: number }>;
}

function validBudgetPayload(p: BudgetPayload): string | null {
    if (!p.name?.trim()) return 'El nombre es requerido';
    if (!Number.isFinite(p.margin_pct) || p.margin_pct < 0 || p.margin_pct > 999) return 'Margen inválido';
    if (!['draft', 'final'].includes(p.status)) return 'Estado inválido';
    for (const m of p.materials) {
        if (!m.label?.trim() || !Number.isFinite(m.qty) || m.qty < 0 || !Number.isFinite(m.unit_cost) || m.unit_cost < 0) {
            return 'Hay líneas de materiales inválidas';
        }
    }
    for (const l of p.labor) {
        if (!l.label?.trim() || !Number.isFinite(l.hours) || l.hours < 0 || !Number.isFinite(l.hourly_rate) || l.hourly_rate < 0) {
            return 'Hay líneas de mano de obra inválidas';
        }
    }
    for (const e of p.extras) {
        if (!e.label?.trim() || !Number.isFinite(e.amount) || e.amount < 0) return 'Hay costos adicionales inválidos';
    }
    return null;
}

// Crea (id null) o actualiza (id) un presupuesto completo. Las líneas se reemplazan
// (delete + insert): simple y suficiente para el volumen de un taller.
export async function saveBudget(id: number | null, payload: BudgetPayload) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    const invalid = validBudgetPayload(payload);
    if (invalid) return { error: invalid };

    const userName = session.user.name || session.user.email || 'Desconocido';

    try {
        let budgetId = id;
        if (budgetId == null) {
            const [row] = await sql`
                INSERT INTO budgets (name, description, alegra_item_id, status, margin_pct, created_by)
                VALUES (${payload.name.trim()}, ${payload.description || null}, ${payload.alegra_item_id ?? null}, ${payload.status}, ${payload.margin_pct}, ${userName})
                RETURNING id
            `;
            budgetId = row.id as number;
        } else {
            const updated = await sql`
                UPDATE budgets
                SET name = ${payload.name.trim()}, description = ${payload.description || null},
                    alegra_item_id = ${payload.alegra_item_id ?? null},
                    status = ${payload.status}, margin_pct = ${payload.margin_pct}
                WHERE id = ${budgetId}
                RETURNING id
            `;
            if (updated.length === 0) return { error: 'Presupuesto no encontrado' };
            await sql`DELETE FROM budget_materials WHERE budget_id = ${budgetId}`;
            await sql`DELETE FROM budget_labor WHERE budget_id = ${budgetId}`;
            await sql`DELETE FROM budget_extras WHERE budget_id = ${budgetId}`;
        }

        for (const m of payload.materials) {
            await sql`
                INSERT INTO budget_materials (budget_id, material_id, label, qty, unit_cost)
                VALUES (${budgetId}, ${m.material_id}, ${m.label.trim()}, ${m.qty}, ${m.unit_cost})
            `;
        }
        for (const l of payload.labor) {
            await sql`
                INSERT INTO budget_labor (budget_id, resource_id, label, hours, hourly_rate)
                VALUES (${budgetId}, ${l.resource_id}, ${l.label.trim()}, ${l.hours}, ${l.hourly_rate})
            `;
        }
        for (const e of payload.extras) {
            await sql`
                INSERT INTO budget_extras (budget_id, label, amount)
                VALUES (${budgetId}, ${e.label.trim()}, ${e.amount})
            `;
        }

        revalidatePath('/costos');
        return { success: true, id: budgetId };
    } catch (error) {
        console.error('Error saving budget:', error);
        return { error: 'Error al guardar el presupuesto' };
    }
}

export async function deleteBudget(id: number) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    try {
        await sql`DELETE FROM budgets WHERE id = ${id}`; // líneas caen por CASCADE
        revalidatePath('/costos');
        return { success: true };
    } catch (error) {
        console.error('Error deleting budget:', error);
        return { error: 'Error al eliminar el presupuesto' };
    }
}

// Margen por defecto para presupuestos nuevos (app_settings.default_margin_pct).
export async function getDefaultMargin(): Promise<number> {
    try {
        const [row] = await sql`SELECT value FROM app_settings WHERE key = 'default_margin_pct'`;
        const n = Number(row?.value);
        return Number.isFinite(n) && n >= 0 ? n : 30;
    } catch {
        return 30;
    }
}
