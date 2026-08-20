'use server';

// Server actions de la vista manual de pedidos y del vocabulario de specs.
// Mismo patrón que lib/budget-actions.ts: auth() por acción, revalidatePath al mutar.
// La creación de pedidos delega en lib/orders.ts, el mismo código que usa la API,
// para que cargar un pedido a mano y recibirlo del bot den el mismo resultado.

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { sql } from '@/lib/database';
import { getCostedProducts } from '@/lib/costed-products';
import {
    createOrder,
    getSpecs,
    ORDER_PRIORITIES,
    ORDER_STATUSES,
    resolveProduct,
    validateOrderPayload,
    validateSpecs,
    type OrderPayload,
} from '@/lib/orders';

export async function createOrderManual(payload: OrderPayload) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    // El external_id existe para la idempotencia del bot. A una persona no le
    // pedimos que invente uno: lo generamos, único y con fecha para que se
    // entienda de dónde salió.
    if (!payload.external_id?.trim()) {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        payload = { ...payload, external_id: `MAN-${stamp}-${Math.random().toString(36).slice(2, 7)}` };
    }
    // Cliente sin ficha en Alegra: le damos un id derivado del nombre, para no
    // obligar a elegir de la lista cuando es alguien nuevo del mostrador.
    if (!payload.customer?.external_id?.trim() && payload.customer?.name?.trim()) {
        payload = {
            ...payload,
            customer: {
                ...payload.customer,
                external_id: `manual:${payload.customer.name.trim().toLowerCase().replace(/\s+/g, '-')}`,
            },
        };
    }

    try {
        const errors = await validateOrderPayload(payload);
        if (errors.length > 0) return { error: errors.join('. ') };

        const { created, order } = await createOrder(payload);
        revalidatePath('/pedidos');
        revalidatePath('/pedidos/lista');
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
        revalidatePath('/pedidos/lista');
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
        revalidatePath('/pedidos/lista');
        return { ok: true };
    } catch (error) {
        console.error('Error en deleteOrder:', error);
        return { error: 'No se pudo borrar el pedido' };
    }
}

// ---------- Vocabulario de specs ----------
// Es el punto del módulo: el equipo de inventario agrega opciones acá y el bot
// las descubre solo por GET /api/specs, sin tocar código ni el CRM.

export async function createSpecField(key: string, label: string, freeText = false) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede editar el vocabulario' };

    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanKey) return { error: 'La clave es requerida' };
    if (!label.trim()) return { error: 'La etiqueta es requerida' };

    try {
        const [exists] = await sql`SELECT key FROM spec_fields WHERE key = ${cleanKey}`;
        if (exists) return { error: `Ya existe un campo con la clave "${cleanKey}"` };

        const [{ next }] = await sql`SELECT COALESCE(MAX(position), 0) + 1 AS next FROM spec_fields`;
        await sql`INSERT INTO spec_fields (key, label, free_text, position) VALUES (${cleanKey}, ${label.trim()}, ${freeText}, ${next})`;
        revalidatePath('/pedidos/opciones');
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
            revalidatePath('/pedidos/opciones');
            return { ok: true, reactivated: true };
        }

        const [{ next }] = await sql`
            SELECT COALESCE(MAX(position), 0) + 1 AS next FROM spec_options WHERE field_key = ${fieldKey}
        `;
        await sql`
            INSERT INTO spec_options (field_key, value, label, position)
            VALUES (${fieldKey}, ${cleanValue}, ${label.trim() || cleanValue}, ${next})
        `;
        revalidatePath('/pedidos/opciones');
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
        revalidatePath('/pedidos/opciones');
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
        revalidatePath('/pedidos/opciones');
        return { ok: true };
    } catch (error) {
        console.error('Error en toggleSpecField:', error);
        return { error: 'No se pudo cambiar el campo' };
    }
}

// Mapa estado interno -> texto al cliente. El doc del CRM pide que sea
// configurable: la jerga del tablero no siempre es lo que conviene mostrarle
// al cliente. Se guarda en app_settings, la misma tabla clave/valor del
// módulo de costos.
export async function saveCustomerStatusMap(map: Record<string, string>) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede editar esto' };

    const clean: Record<string, string> = {};
    for (const status of ORDER_STATUSES) {
        const text = (map[status] ?? '').trim();
        if (text) clean[status] = text;
    }

    try {
        await sql`
            INSERT INTO app_settings (key, value)
            VALUES ('order_customer_status', ${JSON.stringify(clean)}::jsonb)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
        revalidatePath('/pedidos/opciones');
        return { ok: true };
    } catch (error) {
        console.error('Error en saveCustomerStatusMap:', error);
        return { error: 'No se pudo guardar' };
    }
}

// ---------- Edición de un pedido ----------
// Hasta acá lo único editable era el estado. Un pedido que entra del bot con la
// cantidad mal, o al que hay que correrle la fecha, tenía que borrarse y
// rehacerse.

export async function updateOrderFields(
    id: number,
    patch: {
        customer_name?: string | null;
        customer_phone?: string | null;
        priority?: string;
        delivery_date_estimate?: string | null;
        notes?: string | null;
    },
) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };
    if (patch.priority && !ORDER_PRIORITIES.includes(patch.priority as any)) {
        return { error: 'Prioridad inválida' };
    }

    try {
        // COALESCE con el valor actual: así un patch parcial no pisa lo demás.
        // Para los campos que sí se pueden vaciar mandamos '' y lo pasamos a NULL.
        await sql`
            UPDATE orders SET
                customer_name = COALESCE(${patch.customer_name ?? null}, customer_name),
                customer_phone = COALESCE(${patch.customer_phone ?? null}, customer_phone),
                priority = COALESCE(${patch.priority ?? null}, priority),
                delivery_date_estimate = CASE
                    WHEN ${patch.delivery_date_estimate === undefined} THEN delivery_date_estimate
                    WHEN ${patch.delivery_date_estimate ?? ''} = '' THEN NULL
                    ELSE ${patch.delivery_date_estimate ?? null}::date
                END,
                notes = CASE
                    WHEN ${patch.notes === undefined} THEN notes
                    WHEN ${patch.notes ?? ''} = '' THEN NULL
                    ELSE ${patch.notes ?? null}
                END
            WHERE id = ${id}
        `;
        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${id}`);
        return { ok: true };
    } catch (error) {
        console.error('Error en updateOrderFields:', error);
        return { error: 'No se pudo guardar' };
    }
}

// Cambiar cantidad o specs de una línea. La cantidad REESCALA el BOM guardado:
// mantenemos el qty_per_unit congelado del pedido y recalculamos el total, para
// no traer una receta que pudo cambiar después de tomar el pedido.
export async function updateOrderItem(
    itemId: number,
    patch: { quantity?: number; specs?: Record<string, string> },
) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    try {
        const [item] = await sql`SELECT order_id, quantity FROM order_items WHERE id = ${itemId}`;
        if (!item) return { error: 'La línea no existe' };

        if (patch.specs) {
            const errors = validateSpecs(patch.specs, await getSpecs());
            if (errors.length > 0) return { error: errors.join('. ') };
        }

        const quantity = patch.quantity ?? Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'Cantidad inválida' };

        await sql`
            UPDATE order_items SET
                quantity = ${quantity},
                specs = COALESCE(${patch.specs ? JSON.stringify(patch.specs) : null}::jsonb, specs)
            WHERE id = ${itemId}
        `;

        if (patch.quantity !== undefined) {
            await sql`
                UPDATE order_item_materials
                SET qty_total = qty_per_unit * ${quantity}
                WHERE order_item_id = ${itemId}
            `;
        }

        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${item.order_id}`);
        return { ok: true };
    } catch (error) {
        console.error('Error en updateOrderItem:', error);
        return { error: 'No se pudo guardar la línea' };
    }
}

export async function deleteOrderItem(itemId: number) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    try {
        const [item] = await sql`SELECT order_id FROM order_items WHERE id = ${itemId}`;
        if (!item) return { error: 'La línea no existe' };

        const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = ${item.order_id}`;
        if (count <= 1) return { error: 'Un pedido no puede quedar sin líneas' };

        await sql`DELETE FROM order_items WHERE id = ${itemId}`;
        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${item.order_id}`);
        return { ok: true };
    } catch (error) {
        console.error('Error en deleteOrderItem:', error);
        return { error: 'No se pudo borrar la línea' };
    }
}

// Agregar una línea a un pedido existente. Acá SÍ tomamos la receta vigente:
// es una línea nueva, se congela en este momento.
export async function addOrderItem(
    orderId: number,
    payload: { product: string; quantity: number; specs?: Record<string, string> },
) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    if (!payload.product?.trim()) return { error: 'Elegí un producto' };
    if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) return { error: 'Cantidad inválida' };

    const errors = validateSpecs(payload.specs ?? {}, await getSpecs());
    if (errors.length > 0) return { error: errors.join('. ') };

    try {
        const resolved = await resolveProduct(payload.product.trim());
        const [{ next }] = await sql`
            SELECT COALESCE(MAX(line_no), 0) + 1 AS next FROM order_items WHERE order_id = ${orderId}
        `;

        const [line] = await sql`
            INSERT INTO order_items (order_id, line_no, budget_id, product, specs, quantity, needs_review)
            VALUES (
                ${orderId}, ${next}, ${resolved?.budgetId ?? null},
                ${resolved?.label ?? payload.product.trim()},
                ${JSON.stringify(payload.specs ?? {})}::jsonb,
                ${payload.quantity}, ${resolved === null}
            )
            RETURNING id
        `;

        if (resolved) {
            await sql`
                INSERT INTO order_item_materials (order_item_id, material_id, label, qty_per_unit, qty_total)
                SELECT ${line.id}, bm.material_id, bm.label, bm.qty, bm.qty * ${payload.quantity}
                FROM budget_materials bm WHERE bm.budget_id = ${resolved.budgetId}
                ORDER BY bm.id ASC
            `;
        }

        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${orderId}`);
        return { ok: true, needs_review: resolved === null };
    } catch (error) {
        console.error('Error en addOrderItem:', error);
        return { error: 'No se pudo agregar la línea' };
    }
}

// Clientes reales para el alta, del espejo de Alegra. Evita que alguien tenga
// que tipear a mano un customer_external_id como "alegra:1234".
export async function searchCustomers(q: string) {
    const session = await auth();
    if (!session?.user) return [];

    const term = q.trim();
    if (term.length < 2) return [];

    try {
        const rows = await sql`
            SELECT alegra_id, name, phone
            FROM alegra_clients
            WHERE name ILIKE ${`%${term}%`}
            ORDER BY name ASC
            LIMIT 8
        `;
        return (rows as any[]).map((r) => ({
            external_id: r.alegra_id ? `alegra:${r.alegra_id}` : `manual:${r.name}`,
            name: r.name as string,
            phone: (r.phone as string) ?? null,
        }));
    } catch (error) {
        console.error('Error en searchCustomers:', error);
        return [];
    }
}

// Opciones para el modal de alta. Se piden al abrirlo, no en cada carga de
// página: el modal vive en el layout y no siempre se usa.
export async function getNewOrderOptions() {
    const session = await auth();
    if (!session?.user) return { specs: {}, products: [] };

    const [specs, costed] = await Promise.all([getSpecs(), getCostedProducts()]);
    return { specs, products: costed.map((p) => p.name) };
}
