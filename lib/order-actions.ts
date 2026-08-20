'use server';

// Server actions de la vista manual de pedidos y del vocabulario de specs.
// Mismo patrón que lib/budget-actions.ts: auth() por acción, revalidatePath al mutar.
// La creación de pedidos delega en lib/orders.ts, el mismo código que usa la API,
// para que cargar un pedido a mano y recibirlo del bot den el mismo resultado.

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { sql } from '@/lib/database';
import { createOrder, ORDER_STATUSES, validateOrderPayload, type OrderPayload } from '@/lib/orders';

export async function createOrderManual(payload: OrderPayload) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    try {
        const errors = await validateOrderPayload(payload);
        if (errors.length > 0) return { error: errors.join('. ') };

        const { created, order } = await createOrder(payload);
        revalidatePath('/pedidos');
        // No es un error: el external_id ya existía y devolvemos el pedido original.
        return { id: order?.id, created };
    } catch (error) {
        console.error('Error en createOrderManual:', error);
        return { error: 'No se pudo crear el pedido' };
    }
}

export async function updateOrderStatus(id: number, status: string) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };
    if (!ORDER_STATUSES.includes(status as any)) return { error: 'Estado inválido' };

    try {
        await sql`UPDATE orders SET status = ${status} WHERE id = ${id}`;
        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${id}`);
        return { ok: true };
    } catch (error) {
        console.error('Error en updateOrderStatus:', error);
        return { error: 'No se pudo cambiar el estado' };
    }
}

export async function deleteOrder(id: number) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede borrar pedidos' };

    try {
        // Las líneas y el BOM caen por CASCADE.
        await sql`DELETE FROM orders WHERE id = ${id}`;
        revalidatePath('/pedidos');
        return { ok: true };
    } catch (error) {
        console.error('Error en deleteOrder:', error);
        return { error: 'No se pudo borrar el pedido' };
    }
}

// ---------- Vocabulario de specs ----------
// Es el punto del módulo: el equipo de inventario agrega opciones acá y el bot
// las descubre solo por GET /api/specs, sin tocar código ni el CRM.

export async function createSpecField(key: string, label: string) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede editar el vocabulario' };

    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanKey) return { error: 'La clave es requerida' };
    if (!label.trim()) return { error: 'La etiqueta es requerida' };

    try {
        const [exists] = await sql`SELECT key FROM spec_fields WHERE key = ${cleanKey}`;
        if (exists) return { error: `Ya existe un campo con la clave "${cleanKey}"` };

        const [{ next }] = await sql`SELECT COALESCE(MAX(position), 0) + 1 AS next FROM spec_fields`;
        await sql`INSERT INTO spec_fields (key, label, position) VALUES (${cleanKey}, ${label.trim()}, ${next})`;
        revalidatePath('/settings/specs');
        return { ok: true, key: cleanKey };
    } catch (error) {
        console.error('Error en createSpecField:', error);
        return { error: 'No se pudo crear el campo' };
    }
}

export async function createSpecOption(fieldKey: string, value: string, label: string) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede editar el vocabulario' };

    const cleanValue = value.trim();
    if (!cleanValue) return { error: 'El valor es requerido' };

    try {
        const [exists] = await sql`
            SELECT id, active FROM spec_options WHERE field_key = ${fieldKey} AND value = ${cleanValue}
        `;
        // Si estaba desactivada la reactivamos en vez de fallar por el UNIQUE.
        if (exists) {
            if (exists.active) return { error: `"${cleanValue}" ya está en la lista` };
            await sql`UPDATE spec_options SET active = TRUE WHERE id = ${exists.id}`;
            revalidatePath('/settings/specs');
            return { ok: true, reactivated: true };
        }

        const [{ next }] = await sql`
            SELECT COALESCE(MAX(position), 0) + 1 AS next FROM spec_options WHERE field_key = ${fieldKey}
        `;
        await sql`
            INSERT INTO spec_options (field_key, value, label, position)
            VALUES (${fieldKey}, ${cleanValue}, ${label.trim() || cleanValue}, ${next})
        `;
        revalidatePath('/settings/specs');
        return { ok: true };
    } catch (error) {
        console.error('Error en createSpecOption:', error);
        return { error: 'No se pudo agregar la opción' };
    }
}

// Desactivar en vez de borrar: la opción sale del vocabulario que ve el bot pero
// los pedidos históricos que la usaron siguen siendo legibles.
export async function toggleSpecOption(id: number, active: boolean) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede editar el vocabulario' };

    try {
        await sql`UPDATE spec_options SET active = ${active} WHERE id = ${id}`;
        revalidatePath('/settings/specs');
        return { ok: true };
    } catch (error) {
        console.error('Error en toggleSpecOption:', error);
        return { error: 'No se pudo cambiar la opción' };
    }
}

export async function toggleSpecField(key: string, active: boolean) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede editar el vocabulario' };

    try {
        await sql`UPDATE spec_fields SET active = ${active} WHERE key = ${key}`;
        revalidatePath('/settings/specs');
        return { ok: true };
    } catch (error) {
        console.error('Error en toggleSpecField:', error);
        return { error: 'No se pudo cambiar el campo' };
    }
}
