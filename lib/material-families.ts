'use server';

// Familias de materiales: el mapeo "valor de spec -> material" declarado una vez
// y reutilizado por todas las hojas de costo (ver scripts/19-material-families.sql).
//
// Lecturas y escrituras juntas, mismo patrón que lib/budget-actions.ts: neon +
// auth() por función. Las lecturas las usan los server components (/materials/familias,
// el editor de costos) y también el editor desde el cliente al montar.
//
// Los nombres de los materiales NO se guardan en la familia: salen de materials.name
// en cada lectura, así una familia nunca muestra un nombre viejo.
//
// Los tipos y las reglas puras (qué línea arma una familia) están en
// lib/material-family.ts: este archivo es 'use server' y no puede exportar más que
// funciones async, y el editor de costos —cliente— necesita esas reglas.

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import type { CostStrategy, MaterialFamily, MaterialFamilyOption } from '@/lib/material-family';

const sql = neon(process.env.DATABASE_URL!);

export interface MaterialFamilyPayload {
    name: string;
    spec_field_key: string;
    default_spec_value: string | null;
    cost_strategy: CostStrategy;
    cost_material_id: number | null;
    options: Array<{ spec_value: string; material_id: number; is_default: boolean }>;
}

// Todas las familias con sus variantes resueltas contra el inventario.
// Una sola consulta: son pocas (una por materia prima que varía) y el editor de
// costos las necesita enteras para armar la línea sin ir y volver al servidor.
export async function listMaterialFamilies(): Promise<MaterialFamily[]> {
    const session = await auth();
    if (!session?.user) return [];

    const rows = await sql`
        SELECT
            f.id, f.name, f.spec_field_key, f.default_spec_value,
            f.cost_strategy, f.cost_material_id,
            COALESCE(
                json_agg(
                    json_build_object(
                        'specValue', o.spec_value,
                        'materialId', o.material_id,
                        'label', m.name,
                        'unitCost', m.unit_cost,
                        'barcode', m.barcode,
                        'isDefault', o.is_default
                    ) ORDER BY LOWER(o.spec_value) ASC, m.name ASC
                ) FILTER (WHERE o.id IS NOT NULL),
                '[]'
            ) AS options
        FROM material_families f
        LEFT JOIN material_family_options o ON o.family_id = f.id
        LEFT JOIN materials m ON m.id = o.material_id
        GROUP BY f.id
        ORDER BY f.name ASC
    `;

    return rows.map((r) => ({
        id: r.id as number,
        name: r.name as string,
        specFieldKey: r.spec_field_key as string,
        defaultSpecValue: (r.default_spec_value as string | null) ?? null,
        costStrategy: (r.cost_strategy as CostStrategy) ?? 'default',
        costMaterialId: (r.cost_material_id as number | null) ?? null,
        options: (r.options as MaterialFamilyOption[]).map((o) => ({
            specValue: String(o.specValue),
            materialId: Number(o.materialId),
            label: String(o.label),
            unitCost: Number(o.unitCost),
            barcode: String(o.barcode),
            isDefault: Boolean(o.isDefault),
        })),
    }));
}

const VALID_COST_STRATEGIES: CostStrategy[] = ['default', 'average', 'highest', 'specific'];

function validFamilyPayload(p: MaterialFamilyPayload): string | null {
    if (!p.name?.trim()) return 'El nombre de la familia es requerido';
    if (!p.spec_field_key?.trim()) return 'Falta indicar según qué campo varía la familia';
    if (!VALID_COST_STRATEGIES.includes(p.cost_strategy)) return 'Estrategia de costeo inválida';

    const byValue = new Map<string, Array<{ material_id: number; is_default: boolean }>>();
    for (const o of p.options) {
        const value = o.spec_value?.trim();
        if (!value) return 'Hay variantes sin valor';
        if (!Number.isFinite(o.material_id)) return `La variante "${value}" no tiene material`;
        const list = byValue.get(value) ?? [];
        if (list.some((x) => x.material_id === o.material_id)) {
            return `El material de "${value}" está repetido`;
        }
        list.push({ material_id: o.material_id, is_default: o.is_default });
        byValue.set(value, list);
    }

    for (const [value, list] of byValue) {
        const defaults = list.filter((x) => x.is_default).length;
        if (defaults === 0) return `Elegí cuál material es el default de "${value}"`;
        if (defaults > 1) return `Solo puede haber un default en "${value}"`;
    }

    // Sin predeterminada no hay con qué costear la línea que use la familia, así
    // que se exige acá y no en la UI: es la regla, no una ayuda de pantalla.
    if (p.options.length > 0) {
        if (!p.default_spec_value?.trim()) return 'Elegí con qué variante se costea (la predeterminada)';
        if (!byValue.has(p.default_spec_value.trim())) return 'La variante predeterminada tiene que ser una de las cargadas';
    }

    if (p.cost_strategy === 'specific') {
        if (!Number.isFinite(p.cost_material_id)) return 'Elegí qué material se usa para costear';
        if (!p.options.some((o) => o.material_id === p.cost_material_id)) {
            return 'El material de costeo tiene que ser uno de los de la familia';
        }
    }
    return null;
}

// Lógica pura de guardado (sin auth). La usan saveMaterialFamily (UI admin) y las
// tools de IA con su propio guard de seguridad.
export async function insertMaterialFamily(
    id: number | null,
    payload: MaterialFamilyPayload,
): Promise<{ success: true; id: number } | { error: string }> {
    const invalid = validFamilyPayload(payload);
    if (invalid) return { error: invalid };

    const name = payload.name.trim();
    const fieldKey = payload.spec_field_key.trim();
    const defaultValue = payload.options.length > 0 ? payload.default_spec_value!.trim() : null;
    const costStrategy = payload.cost_strategy;
    const costMaterialId = payload.cost_strategy === 'specific' ? payload.cost_material_id : null;

    try {
        let familyId = id;
        if (familyId == null) {
            const [row] = await sql`
                INSERT INTO material_families (name, spec_field_key, default_spec_value, cost_strategy, cost_material_id)
                VALUES (${name}, ${fieldKey}, ${defaultValue}, ${costStrategy}, ${costMaterialId})
                RETURNING id
            `;
            familyId = row.id as number;
        } else {
            const updated = await sql`
                UPDATE material_families
                SET name = ${name}, spec_field_key = ${fieldKey},
                    default_spec_value = ${defaultValue},
                    cost_strategy = ${costStrategy}, cost_material_id = ${costMaterialId},
                    updated_at = NOW()
                WHERE id = ${familyId}
                RETURNING id
            `;
            if (updated.length === 0) return { error: 'La familia no existe' };
            await sql`DELETE FROM material_family_options WHERE family_id = ${familyId}`;
        }

        for (const o of payload.options) {
            await sql`
                INSERT INTO material_family_options (family_id, spec_value, material_id, is_default)
                VALUES (${familyId}, ${o.spec_value.trim()}, ${o.material_id}, ${o.is_default})
            `;
        }

        revalidatePath('/materials/familias');
        // Las hojas de costo muestran las variantes de la familia en vivo.
        revalidatePath('/costos');
        return { success: true, id: familyId };
    } catch (error) {
        // El nombre es UNIQUE: dos familias "Tira LED" serían indistinguibles en
        // el buscador de la hoja de costo.
        if (error instanceof Error && error.message.includes('material_families_name_key')) {
            return { error: `Ya existe una familia llamada "${name}"` };
        }
        console.error('Error saving material family:', error);
        return { error: 'Error al guardar la familia' };
    }
}

// Crea (id null) o actualiza (id) una familia entera. Las variantes se reemplazan
// (delete + insert), igual que las líneas de una hoja de costo: son pocas y así el
// guardado es una sola verdad, sin diffs.
export async function saveMaterialFamily(id: number | null, payload: MaterialFamilyPayload) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'No tenés permisos para realizar esta acción' };
    return insertMaterialFamily(id, payload);
}

// Borra la familia. Las líneas de hoja de costo que la usaban NO pierden sus
// variantes: quedan con la foto que guardaron en budget_material_options
// (ON DELETE SET NULL sobre budget_materials.family_id), o sea que pasan a
// comportarse como una línea cargada a mano.
export async function deleteMaterialFamily(id: number) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'No tenés permisos para realizar esta acción' };

    try {
        const [row] = await sql`
            SELECT COUNT(*)::int AS n FROM budget_materials WHERE family_id = ${id}
        `;
        await sql`DELETE FROM material_families WHERE id = ${id}`;
        revalidatePath('/materials/familias');
        revalidatePath('/costos');
        return { success: true, unlinked: (row?.n as number) ?? 0 };
    } catch (error) {
        console.error('Error deleting material family:', error);
        return { error: 'Error al eliminar la familia' };
    }
}
