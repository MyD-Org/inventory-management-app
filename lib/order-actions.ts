'use server';

// Server actions de la vista manual de pedidos y del vocabulario de specs.
// Mismo patrón que lib/budget-actions.ts: auth() por acción, revalidatePath al mutar.
// La creación de pedidos delega en lib/orders.ts, el mismo código que usa la API,
// para que cargar un pedido a mano y recibirlo del bot den el mismo resultado.

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { sql } from '@/lib/database';
import { sameSpecs } from '@/lib/bom';
import {
    createOrder,
    explodeBom,
    getSpecs,
    listSellableProducts,
    materialNeeds,
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

        // Mover la tarjeta a 'facturado' NO emite nada. Emitir es irreversible del
        // lado de Alegra —una factura se anula, no se borra— y cualquiera puede
        // mover una tarjeta, incluso sin querer. La emisión es un acto explícito:
        // el botón del detalle del pedido, que además muestra antes qué se va a
        // facturar. 'facturado' vuelve a ser lo que era: un estado del tablero.
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

// Cambiar cantidad o specs de una línea.
//
// CANTIDAD: reescala el BOM guardado (mantiene el qty_per_unit congelado del
// pedido y recalcula el total), para no traer una receta que pudo cambiar después
// de tomar el pedido.
//
// SPECS: acá el congelado NO se puede sostener. Pasar de clamp='larga' a 'corta'
// es otra grampa, y para saber cuál hay que volver a leer budget_materials. O sea
// que corregir las specs de un pedido viejo lo re-explota con la receta de HOY: si
// la hoja de costo cambió desde que se tomó, el BOM queda actualizado, no como
// estaba. Es el precio de poder corregir la variante; la alternativa —dejar el
// material equivocado— es peor. Si el pedido ya descontó stock no se toca nada.
export async function updateOrderItem(
    itemId: number,
    patch: { quantity?: number; specs?: Record<string, string> },
) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    try {
        const [item] = await sql`SELECT order_id, quantity, budget_id, specs FROM order_items WHERE id = ${itemId}`;
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

        // Si cambian las specs puede cambiar el MATERIAL, no solo la cantidad:
        // pasar de clamp='larga' a 'corta' es otra grampa. Ahí hay que re-explotar
        // la receta, salvo que ya se haya descontado stock contra este pedido —
        // ahí el BOM guardado es el registro de lo que efectivamente salió del
        // depósito y no se toca; el taller ajusta a mano.
        const specsChanged =
            patch.specs !== undefined && !sameSpecs(patch.specs, (item.specs ?? {}) as Record<string, unknown>);
        let consumed = false;

        if (specsChanged && item.budget_id) {
            const [{ count }] = await sql`
                SELECT COUNT(*)::int AS count FROM stock_movements
                WHERE order_id = ${item.order_id} AND movement_type = 'salida'
            `;
            consumed = count > 0;
            if (!consumed) {
                // El driver HTTP de neon no da transacciones interactivas, así que
                // el DELETE + INSERT no es atómico: si falla en el medio la línea
                // se queda sin materiales. Guardamos el BOM viejo en memoria y lo
                // reponemos en el catch, igual que el DELETE compensatorio de
                // createOrder. Sin esto, un timeout deja el pedido sin receta y no
                // hay de dónde recuperarla.
                const previo = await sql`
                    SELECT material_id, label, qty_per_unit, qty_total
                    FROM order_item_materials WHERE order_item_id = ${itemId} ORDER BY id ASC
                `;
                await sql`DELETE FROM order_item_materials WHERE order_item_id = ${itemId}`;
                try {
                    await explodeBom(itemId, item.budget_id as number, patch.specs ?? {}, quantity);
                } catch (error) {
                    await sql`DELETE FROM order_item_materials WHERE order_item_id = ${itemId}`;
                    for (const m of previo) {
                        await sql`
                            INSERT INTO order_item_materials (order_item_id, material_id, label, qty_per_unit, qty_total)
                            VALUES (${itemId}, ${m.material_id}, ${m.label}, ${m.qty_per_unit}, ${m.qty_total})
                        `;
                    }
                    throw error;
                }
            }
        }

        // Si no se re-explotó (specs iguales, línea sin receta, o stock ya
        // descontado) la cantidad igual tiene que reescalar el BOM guardado.
        const reexploded = specsChanged && Boolean(item.budget_id) && !consumed;
        if (!reexploded && patch.quantity !== undefined) {
            await sql`
                UPDATE order_item_materials
                SET qty_total = qty_per_unit * ${quantity}
                WHERE order_item_id = ${itemId}
            `;
        }

        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${item.order_id}`);
        if (consumed) {
            return {
                ok: true,
                warning:
                    'Se guardaron los cambios, pero los materiales no se recalcularon porque este pedido ya descontó stock. Revisá el descuento a mano.',
            };
        }
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
            INSERT INTO order_items (order_id, line_no, budget_id, alegra_item_id, product, specs, quantity, needs_review)
            VALUES (
                ${orderId}, ${next}, ${resolved?.budgetId ?? null},
                ${resolved?.alegraItemId ?? null},
                ${resolved?.label ?? payload.product.trim()},
                ${JSON.stringify(payload.specs ?? {})}::jsonb,
                ${payload.quantity}, ${!resolved?.budgetId}
            )
            RETURNING id
        `;

        let unmapped: string[] = [];
        if (resolved?.budgetId) {
            ({ unmapped } = await explodeBom(
                line.id as number,
                resolved.budgetId,
                payload.specs ?? {},
                payload.quantity,
            ));
        }

        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${orderId}`);
        // Tres señales distintas, cada una con su dueño:
        //   needs_review -> sin hoja de costo: no hay lista de materiales.
        //   unmapped     -> hay BOM pero un valor pedido no está mapeado.
        //   sin_alegra   -> el producto no está en el catálogo: no se puede facturar.
        return {
            ok: true,
            needs_review: !resolved?.budgetId,
            unmapped,
            sin_alegra: !resolved?.alegraItemId,
        };
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

    // Del CATÁLOGO de Alegra, no de las hojas de costo: un producto existe
    // porque se vende. Listar hojas dejaba el selector vacío en producción,
    // donde hay 162 productos vendibles y ninguna hoja cargada.
    const [specs, products] = await Promise.all([getSpecs(), listSellableProducts()]);
    return { specs, products };
}

// Borrar una opción del vocabulario, de verdad. No rompe el historial: las
// specs de cada línea se guardan como texto en order_items.specs, no como
// referencia a spec_options, así que los pedidos viejos siguen mostrando lo que
// se pidió aunque la opción ya no exista.
export async function deleteSpecOption(id: number) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede editar el vocabulario' };

    try {
        await sql`DELETE FROM spec_options WHERE id = ${id}`;
        revalidatePath('/pedidos/opciones');
        return { ok: true };
    } catch (error) {
        console.error('Error en deleteSpecOption:', error);
        return { error: 'No se pudo borrar la opción' };
    }
}

// Borrar un campo entero se lleva sus opciones por CASCADE. Mismo criterio: los
// pedidos que ya lo usaron conservan el valor en su specs.
export async function deleteSpecField(key: string) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede editar el vocabulario' };

    try {
        // Las variantes cuelgan de la LÍNEA de la hoja de costo, no del campo, así
        // que el ON DELETE SET NULL de budget_materials.spec_field_key las dejaría
        // huérfanas: filas invisibles desde la UI que nadie vuelve a usar. Se van
        // primero, mientras todavía se sabe cuáles eran.
        await sql`
            DELETE FROM budget_material_options
            WHERE budget_material_id IN (SELECT id FROM budget_materials WHERE spec_field_key = ${key})
        `;
        await sql`DELETE FROM spec_fields WHERE key = ${key}`;
        revalidatePath('/pedidos/opciones');
        revalidatePath('/costos');
        return { ok: true };
    } catch (error) {
        console.error('Error en deleteSpecField:', error);
        return { error: 'No se pudo borrar el campo' };
    }
}

// Descontar materiales del inventario por un pedido. Cada línea se registra
// como una SALIDA normal en stock_movements (con su stock previo y posterior),
// así aparece en el historial del inventario como cualquier otro movimiento, y
// queda vinculada al pedido por order_id.
//
// Se puede descontar en varias veces: lo ya descontado se descuenta de lo
// pendiente, así el depósito puede entregar a medida que llega la mercadería.
export async function consumeOrderMaterials(
    orderId: number,
    items: { material_id: number; quantity: number }[],
) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    const aDescontar = items.filter((i) => Number.isFinite(i.quantity) && i.quantity > 0);
    if (aDescontar.length === 0) return { error: 'No hay nada para descontar' };

    const userName = session.user.name || session.user.email || 'Desconocido';

    try {
        const [order] = await sql`
            SELECT order_number, customer_name, customer_external_id
            FROM orders WHERE id = ${orderId}
        `;
        if (!order) return { error: 'El pedido no existe' };

        // La nota del movimiento es la única columna libre que se ve en el
        // historial del inventario. Decir "consumo de materiales del pedido" no
        // agrega nada (la referencia ya dice "Pedido #105"): lo útil es QUÉ se
        // estaba fabricando y para quién.
        const lineas = await sql`
            SELECT quantity, product FROM order_items
            WHERE order_id = ${orderId} ORDER BY line_no ASC
        `;
        const queSeArma = (lineas as any[])
            .map((l) => `${Number(l.quantity)} × ${l.product}`)
            .join(', ');
        const cliente = order.customer_name || order.customer_external_id;
        const nota = [queSeArma, cliente].filter(Boolean).join(' · ').slice(0, 240);

        // Validamos TODO antes de tocar nada: si un material no alcanza, no
        // queremos dejar la mitad descontada.
        const faltantes: string[] = [];
        for (const item of aDescontar) {
            const [inv] = await sql`
                SELECT i.current_stock, i.available_stock, m.name
                FROM inventory i JOIN materials m ON m.id = i.material_id
                WHERE i.material_id = ${item.material_id}
            `;
            if (!inv) {
                faltantes.push(`Material ${item.material_id} no está en el inventario`);
            } else if (item.quantity > Number(inv.available_stock)) {
                faltantes.push(`${inv.name}: pedís ${item.quantity} y hay ${inv.available_stock}`);
            }
        }
        if (faltantes.length > 0) return { error: faltantes.join('. ') };

        for (const item of aDescontar) {
            const [inv] = await sql`
                SELECT current_stock FROM inventory WHERE material_id = ${item.material_id}
            `;
            const previo = Number(inv.current_stock);
            const nuevo = previo - item.quantity;

            await sql`
                INSERT INTO stock_movements (
                    material_id, movement_type, quantity, previous_stock, new_stock,
                    reference_number, notes, user_name, order_id
                )
                VALUES (
                    ${item.material_id}, 'salida', ${item.quantity}, ${previo}, ${nuevo},
                    ${`Pedido #${order.order_number}`},
                    ${nota},
                    ${userName}, ${orderId}
                )
            `;
            await sql`
                UPDATE inventory SET current_stock = ${nuevo}, last_updated = NOW()
                WHERE material_id = ${item.material_id}
            `;
        }

        revalidatePath(`/pedidos/${orderId}`);
        revalidatePath('/inventory');
        revalidatePath('/movimientos');
        return { ok: true, count: aDescontar.length };
    } catch (error) {
        console.error('Error en consumeOrderMaterials:', error);
        return { error: 'No se pudo descontar del inventario' };
    }
}

// Pedidos que todavía tienen materiales sin descontar. Lo usa el inventario
// para ofrecer "descontar los materiales de un pedido" desde Salida de Stock,
// sin tener que ir a buscar el pedido al otro módulo.
export async function listOrdersWithPendingMaterials() {
    const session = await auth();
    if (!session?.user) return [];

    try {
        const rows = await sql`
            SELECT o.id, o.order_number, o.customer_name, o.customer_external_id, o.status
            FROM orders o
            WHERE o.status NOT IN ('retirado', 'cancelado')
              AND EXISTS (
                SELECT 1
                FROM order_item_materials oim
                JOIN order_items oi ON oi.id = oim.order_item_id
                WHERE oi.order_id = o.id AND oim.material_id IS NOT NULL
                GROUP BY oim.material_id
                HAVING SUM(oim.qty_total) > COALESCE((
                    SELECT SUM(sm.quantity) FROM stock_movements sm
                    WHERE sm.order_id = o.id AND sm.material_id = oim.material_id
                      AND sm.movement_type = 'salida'
                ), 0)
              )
            ORDER BY o.created_at DESC
            LIMIT 30
        `;
        return (rows as any[]).map((r) => ({
            id: r.id as number,
            order_number: r.order_number as number,
            customer: (r.customer_name as string) ?? (r.customer_external_id as string),
        }));
    } catch (error) {
        console.error('Error en listOrdersWithPendingMaterials:', error);
        return [];
    }
}

export async function getOrderNeeds(orderId: number) {
    const session = await auth();
    if (!session?.user) return [];
    return materialNeeds(orderId);
}

// Materiales del inventario, para agregar una fila al descuento que no venía
// en la receta del pedido (un consumible, algo que se rompió al armar).
export async function searchInventoryMaterials(q: string) {
    const session = await auth();
    if (!session?.user) return [];

    const term = q.trim();
    if (term.length < 2) return [];

    try {
        const rows = await sql`
            SELECT m.id, m.name, COALESCE(i.available_stock, 0) AS available
            FROM materials m
            LEFT JOIN inventory i ON i.material_id = m.id
            WHERE m.name ILIKE ${`%${term}%`} OR m.barcode ILIKE ${`%${term}%`}
            ORDER BY m.name ASC
            LIMIT 8
        `;
        return (rows as any[]).map((r) => ({
            material_id: r.id as number,
            label: r.name as string,
            available: Number(r.available),
        }));
    } catch (error) {
        console.error('Error en searchInventoryMaterials:', error);
        return [];
    }
}
