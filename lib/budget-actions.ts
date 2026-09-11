'use server';

// Server actions del módulo de costos de fabricación (recursos de mano de obra +
// cálculos de costo). Mismo patrón que lib/actions.ts: neon + auth() por acción,
// revalidatePath al mutar.

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { refreshBomsForBudget } from '@/lib/orders';
import { bomFingerprint, bomRefreshMessage, type BomFingerprintRow, type BomRefreshReport } from '@/lib/bom-refresh';

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
    // spec_field_key + options: variantes de la línea (la tira LED cálida y la
    // azul son materiales distintos). El costo lo define SIEMPRE el material de
    // la línea (material_id / unit_cost); las variantes no tienen costo propio.
    materials: Array<{
        material_id: number | null;
        label: string;
        qty: number;
        unit_cost: number;
        spec_field_key?: string | null;
        // qty por variante: cuánto sale del depósito con esa opción. Ausente o null
        // = la cantidad de la línea; 0 = con esa opción la línea no va. NO afecta
        // el costo, que sigue siendo qty * unit_cost de la línea (ver
        // scripts/34-cantidad-por-variante.sql).
        options?: Array<{ spec_value: string; material_id: number | null; label: string; qty?: number | null }>;
        // Familia de materiales que arma esta línea (ver lib/material-families.ts).
        // null = mapeo propio de la línea. Vinculada, las variantes se leen de la
        // familia al explotar el BOM; las de acá quedan igual como foto.
        family_id?: number | null;
    }>;
    labor: Array<{ resource_id: number | null; label: string; hours: number; hourly_rate: number }>;
    // Otros costos. material_id opcional: la línea puede ser texto libre (flete,
    // tercerizado) o estar vinculada a una materia prima del inventario, y en ese
    // caso amount = qty * unit_cost (snapshot, como en materials). Vinculada o no,
    // una línea de acá es SOLO costo: no entra al BOM ni descuenta stock.
    extras: Array<{
        label: string;
        amount: number;
        material_id?: number | null;
        qty?: number | null;
        unit_cost?: number | null;
    }>;
}

function validBudgetPayload(p: BudgetPayload): string | null {
    if (!p.name?.trim()) return 'El nombre es requerido';
    if (!Number.isFinite(p.margin_pct) || p.margin_pct < 0 || p.margin_pct > 999) return 'Margen inválido';
    if (!['draft', 'final'].includes(p.status)) return 'Estado inválido';
    for (const m of p.materials) {
        if (!m.label?.trim() || !Number.isFinite(m.qty) || m.qty < 0 || !Number.isFinite(m.unit_cost) || m.unit_cost < 0) {
            return 'Hay líneas de materiales inválidas';
        }
        const options = m.options ?? [];
        if (m.family_id != null && !m.spec_field_key?.trim()) {
            return `La línea "${m.label.trim()}" usa una familia pero no dice según qué campo varía`;
        }
        if (options.length > 0 && !m.spec_field_key?.trim()) {
            return `La línea "${m.label.trim()}" tiene variantes pero no dice según qué campo varía`;
        }
        const seen = new Set<string>();
        for (const o of options) {
            if (!o.spec_value?.trim() || !o.label?.trim()) return `Hay variantes incompletas en "${m.label.trim()}"`;
            // El 0 es válido y significa "con esta opción no lleva nada", así que
            // solo se rechaza lo que no es un número o es negativo.
            if (o.qty !== undefined && o.qty !== null && (!Number.isFinite(o.qty) || o.qty < 0)) {
                return `La cantidad de la variante "${o.spec_value.trim()}" en "${m.label.trim()}" es inválida`;
            }
            if (seen.has(o.spec_value.trim())) return `La variante "${o.spec_value.trim()}" está repetida en "${m.label.trim()}"`;
            seen.add(o.spec_value.trim());
        }
    }
    for (const l of p.labor) {
        if (!l.label?.trim() || !Number.isFinite(l.hours) || l.hours < 0 || !Number.isFinite(l.hourly_rate) || l.hourly_rate < 0) {
            return 'Hay líneas de mano de obra inválidas';
        }
    }
    for (const e of p.extras) {
        if (!e.label?.trim() || !Number.isFinite(e.amount) || e.amount < 0) return 'Hay costos adicionales inválidos';
        if (e.material_id != null) {
            if (!Number.isFinite(e.qty ?? NaN) || (e.qty as number) < 0) return `La cantidad de "${e.label.trim()}" es inválida`;
            if (!Number.isFinite(e.unit_cost ?? NaN) || (e.unit_cost as number) < 0) return `El costo unitario de "${e.label.trim()}" es inválido`;
        }
    }
    return null;
}

// Lee la lista de materiales de la ficha para sacarle la huella. La huella —qué
// cuenta como "cambió la receta" y qué no— la calcula lib/bom-refresh.ts, que no
// toca la base y por eso se puede testear.
async function readBomFingerprint(budgetId: number): Promise<string> {
    const rows = await sql`
        SELECT
            bm.material_id, bm.label, bm.qty, bm.spec_field_key, bm.family_id,
            COALESCE(
                json_agg(
                    json_build_object('v', o.spec_value, 'm', o.material_id, 'q', o.qty)
                ) FILTER (WHERE o.id IS NOT NULL),
                '[]'
            ) AS options
        FROM budget_materials bm
        LEFT JOIN budget_material_options o ON o.budget_material_id = bm.id
        WHERE bm.budget_id = ${budgetId}
        GROUP BY bm.id, bm.material_id, bm.label, bm.qty, bm.spec_field_key, bm.family_id
    `;
    return bomFingerprint(rows as unknown as BomFingerprintRow[]);
}

// Crea (id null) o actualiza (id) un presupuesto completo. Las líneas se reemplazan
// (delete + insert): simple y suficiente para el volumen de un taller.
export async function saveBudget(id: number | null, payload: BudgetPayload) {
    const session = await auth();
    // Las fichas de costo son territorio de admin: exponen costos y márgenes.
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const invalid = validBudgetPayload(payload);
    if (invalid) return { error: invalid };

    const userName = session.user.name || session.user.email || 'Desconocido';

    try {
        // Una ficha por producto. El nombre es la clave con la que el resto del
        // sistema encuentra el producto —resolveProduct() del módulo de pedidos y
        // las tools de IA buscan la hoja de costo por nombre—, y con dos fichas
        // iguales se queda con la más nueva sin avisar. El índice único de
        // scripts/25-unique-budget-name.sql lo impide igual; esto es para que se
        // vea un mensaje y no un error de base.
        const repetido = await sql`
            SELECT id FROM budgets
            WHERE lower(name) = lower(${payload.name.trim()})
              AND (${id}::int IS NULL OR id <> ${id}::int)
            LIMIT 1
        `;
        if (repetido.length > 0) {
            return {
                error: `Ya hay una ficha de "${payload.name.trim()}". Abrila y editala en vez de crear otra.`,
                existingId: repetido[0].id as number,
            };
        }

        let budgetId = id;
        // null = ficha nueva: no hay pedidos en marcha que dependan de ella.
        let bomAntes: string | null = null;
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
            // Antes de borrar las líneas: después ya no hay con qué comparar.
            bomAntes = await readBomFingerprint(budgetId);
            await sql`DELETE FROM budget_materials WHERE budget_id = ${budgetId}`;
            await sql`DELETE FROM budget_labor WHERE budget_id = ${budgetId}`;
            await sql`DELETE FROM budget_extras WHERE budget_id = ${budgetId}`;
        }

        // Las líneas se reinsertan con id nuevo en cada guardado (delete + insert),
        // y budget_material_options cuelga de ese id por CASCADE: por eso hace
        // falta el RETURNING id y reinsertar las variantes acá, o se pierden en
        // silencio en la primera edición.
        for (const m of payload.materials) {
            const [line] = await sql`
                INSERT INTO budget_materials (budget_id, material_id, label, qty, unit_cost, spec_field_key, family_id)
                VALUES (${budgetId}, ${m.material_id}, ${m.label.trim()}, ${m.qty}, ${m.unit_cost}, ${m.spec_field_key?.trim() || null}, ${m.family_id ?? null})
                RETURNING id
            `;
            for (const o of m.options ?? []) {
                await sql`
                    INSERT INTO budget_material_options (budget_material_id, spec_value, material_id, label, qty)
                    VALUES (${line.id}, ${o.spec_value.trim()}, ${o.material_id}, ${o.label.trim()}, ${o.qty ?? null})
                `;
            }
        }
        for (const l of payload.labor) {
            await sql`
                INSERT INTO budget_labor (budget_id, resource_id, label, hours, hourly_rate)
                VALUES (${budgetId}, ${l.resource_id}, ${l.label.trim()}, ${l.hours}, ${l.hourly_rate})
            `;
        }
        for (const e of payload.extras) {
            await sql`
                INSERT INTO budget_extras (budget_id, label, amount, material_id, qty, unit_cost)
                VALUES (${budgetId}, ${e.label.trim()}, ${e.amount}, ${e.material_id ?? null}, ${e.material_id == null ? null : (e.qty ?? 0)}, ${e.material_id == null ? null : (e.unit_cost ?? 0)})
            `;
        }

        // La ficha cambió de receta: los pedidos que todavía se están
        // fabricando con ella tienen que descontar lo que dice la ficha de
        // ahora, no la copia que se congeló cuando entró el pedido. Los que ya
        // descontaron stock o ya están fabricados no se tocan: vuelven en
        // `pending` para que quien guardó sepa cuáles mirar a mano.
        let bomRefresh: BomRefreshReport | null = null;
        if (bomAntes !== null && (await readBomFingerprint(budgetId)) !== bomAntes) {
            bomRefresh = await refreshBomsForBudget(budgetId);
            if (bomRefresh.updated.length > 0) {
                revalidatePath('/pedidos');
                for (const o of bomRefresh.updated) revalidatePath(`/pedidos/${o.orderId}`);
            }
        }

        revalidatePath('/fichas');
        return { success: true, id: budgetId, bomRefresh: bomRefresh && bomRefreshMessage(bomRefresh) };
    } catch (error) {
        console.error('Error saving budget:', error);
        return { error: 'Error al guardar el presupuesto' };
    }
}

export async function deleteBudget(id: number) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    try {
        await sql`DELETE FROM budgets WHERE id = ${id}`; // líneas caen por CASCADE
        revalidatePath('/fichas');
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
