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
import type { MaterialFamily, MaterialFamilyOption } from '@/lib/material-family';

const sql = neon(process.env.DATABASE_URL!);

export interface MaterialFamilyPayload {
    name: string;
    spec_field_key: string;
    default_spec_value: string | null;
    options: Array<{ spec_value: string; material_id: number }>;
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
            COALESCE(
                json_agg(
                    json_build_object(
                        'specValue', o.spec_value,
                        'materialId', o.material_id,
                        'label', m.name,
                        'unitCost', m.unit_cost,
                        'barcode', m.barcode
                    ) ORDER BY o.id
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
        options: (r.options as MaterialFamilyOption[]).map((o) => ({
            specValue: String(o.specValue),
            materialId: Number(o.materialId),
            label: String(o.label),
            unitCost: Number(o.unitCost),
            barcode: String(o.barcode),
        })),
    }));
}

function validFamilyPayload(p: MaterialFamilyPayload): string | null {
    if (!p.name?.trim()) return 'El nombre de la familia es requerido';
    if (!p.spec_field_key?.trim()) return 'Falta indicar según qué campo varía la familia';

    const seen = new Set<string>();
    for (const o of p.options) {
        const value = o.spec_value?.trim();
        if (!value) return 'Hay variantes sin valor';
        if (!Number.isFinite(o.material_id)) return `La variante "${value}" no tiene material`;
        if (seen.has(value)) return `La variante "${value}" está repetida`;
        seen.add(value);
    }
    // Sin predeterminada no hay con qué costear la línea que use la familia, así
    // que se exige acá y no en la UI: es la regla, no una ayuda de pantalla.
    if (p.options.length > 0) {
        if (!p.default_spec_value?.trim()) return 'Elegí con qué variante se costea (la predeterminada)';
        if (!seen.has(p.default_spec_value.trim())) return 'La variante predeterminada tiene que ser una de las cargadas';
    }
    return null;
}

// Crea (id null) o actualiza (id) una familia entera. Las variantes se reemplazan
// (delete + insert), igual que las líneas de una hoja de costo: son pocas y así el
// guardado es una sola verdad, sin diffs.
export async function saveMaterialFamily(id: number | null, payload: MaterialFamilyPayload) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'No tenés permisos para realizar esta acción' };

    const invalid = validFamilyPayload(payload);
    if (invalid) return { error: invalid };

    const name = payload.name.trim();
    const fieldKey = payload.spec_field_key.trim();
    const defaultValue = payload.options.length > 0 ? payload.default_spec_value!.trim() : null;

    try {
        let familyId = id;
        if (familyId == null) {
            const [row] = await sql`
                INSERT INTO material_families (name, spec_field_key, default_spec_value)
                VALUES (${name}, ${fieldKey}, ${defaultValue})
                RETURNING id
            `;
            familyId = row.id as number;
        } else {
            const updated = await sql`
                UPDATE material_families
                SET name = ${name}, spec_field_key = ${fieldKey},
                    default_spec_value = ${defaultValue}, updated_at = NOW()
                WHERE id = ${familyId}
                RETURNING id
            `;
            if (updated.length === 0) return { error: 'La familia no existe' };
            await sql`DELETE FROM material_family_options WHERE family_id = ${familyId}`;
        }

        for (const o of payload.options) {
            await sql`
                INSERT INTO material_family_options (family_id, spec_value, material_id)
                VALUES (${familyId}, ${o.spec_value.trim()}, ${o.material_id})
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
