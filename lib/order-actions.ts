'use server';

// Server actions de la vista manual de pedidos y del vocabulario de specs.
// Mismo patrón que lib/budget-actions.ts: auth() por acción, revalidatePath al mutar.
// La creación de pedidos delega en lib/orders.ts, el mismo código que usa la API,
// para que cargar un pedido a mano y recibirlo del bot den el mismo resultado.

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { logOrderEvent, logOrderEvents } from '@/lib/order-events';
import { sql } from '@/lib/database';
import { invoiceOrder } from '@/lib/invoicing';
import {
    addOrderItemInternal,
    createOrder,
    deleteOrderItemInternal,
    diffSpecs,
    getSpecs,
    listSellableProducts,
    markDocumentsStale,
    materialNeeds,
    ORDER_PRIORITIES,
    ORDER_STATUSES,
    updateOrderItemInternal,
    validateOrderPayload,
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
        // Solo si se creó de verdad: si el external_id ya existía, createOrder
        // devuelve el pedido original y no hubo alta que registrar.
        if (created && order?.id) {
            await logOrderEvent(order.id, { kind: 'created', newValue: payload.origin ?? 'manual' });
            if (payload.notes?.trim()) {
                await logOrderEvent(order.id, { kind: 'note', body: payload.notes.trim() });
            }
        }
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
        // No se puede pasar a listo para retirar sin haber facturado: la factura
        // es el paso previo obligatorio en el flujo.
        if (status === 'listo_para_retirar') {
            const [order] = await sql`SELECT alegra_invoice_id FROM orders WHERE id = ${id}`;
            if (!order?.alegra_invoice_id) {
                return { error: 'Falta emitir la factura antes de pasar a listo para retirar' };
            }
        }

        const [previo] = await sql`SELECT status FROM orders WHERE id = ${id}`;
        await sql`UPDATE orders SET status = ${status} WHERE id = ${id}`;
        if (previo?.status !== status) {
            await logOrderEvent(id, {
                kind: 'status',
                field: 'status',
                oldValue: previo?.status ?? null,
                newValue: status,
            });
        }

        // Al pasar a 'por_facturar' intentamos emitir el borrador en Alegra de
        // forma automática. Si falla, el estado cambia igual y queda visible el
        // botón manual para reintentar.
        let warning: string | null = null;
        if (status === 'por_facturar') {
            const [order] = await sql`
                SELECT alegra_invoice_id, invoice_terms, invoice_notes
                FROM orders WHERE id = ${id}
            `;
            if (!order?.alegra_invoice_id) {
                try {
                    const result = await invoiceOrder(id, {
                        terms: order.invoice_terms ?? undefined,
                        notes: order.invoice_notes ?? undefined,
                    });
                    if (result.invoiceId != null) {
                        await logOrderEvent(id, {
                            kind: 'invoice',
                            newValue: result.invoiceNumber ?? String(result.invoiceId),
                            actor: { name: 'Sistema' },
                        });
                    }
                    if (result.invoiceId == null) {
                        warning = result.warnings?.[0] ?? 'No se pudo generar la factura automáticamente.';
                        if (result.warnings && result.warnings.length > 0) {
                            await sql`
                                UPDATE orders
                                SET invoice_warnings = ${JSON.stringify(result.warnings)}::jsonb
                                WHERE id = ${id}
                            `;
                        }
                    }
                } catch (err) {
                    console.error('Error facturando automáticamente:', err);
                    warning = err instanceof Error ? err.message : 'Error al facturar automáticamente.';
                }
            }
        }

        revalidatePath('/pedidos');
        revalidatePath('/pedidos/lista');
        revalidatePath(`/pedidos/${id}`);
        return { ok: true, warning };
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
        revalidatePath('/settings/variaciones');
        revalidatePath('/materials/familias');
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
            revalidatePath('/settings/variaciones');
            revalidatePath('/materials/familias');
            return { ok: true, reactivated: true };
        }

        const [{ next }] = await sql`
            SELECT COALESCE(MAX(position), 0) + 1 AS next FROM spec_options WHERE field_key = ${fieldKey}
        `;
        await sql`
            INSERT INTO spec_options (field_key, value, label, position)
            VALUES (${fieldKey}, ${cleanValue}, ${label.trim() || cleanValue}, ${next})
        `;
        revalidatePath('/settings/variaciones');
        revalidatePath('/materials/familias');
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
        revalidatePath('/settings/variaciones');
        revalidatePath('/materials/familias');
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
        revalidatePath('/settings/variaciones');
        revalidatePath('/materials/familias');
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
        customer_external_id?: string | null;
        customer_phone?: string | null;
        priority?: string;
        delivery_date_estimate?: string | null;
        notes?: string | null;
        invoice_terms?: string | null;
        invoice_notes?: string | null;
    },
) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };
    if (patch.priority && !ORDER_PRIORITIES.includes(patch.priority as any)) {
        return { error: 'Prioridad inválida' };
    }

    // Se lee el pedido ANTES de tocarlo: el UPDATE es uno solo con CASE, así que
    // sin esta foto no hay forma de decir "de 04/09 a 11/09", solo "cambió".
    const [antes] = await sql`
        SELECT customer_name, customer_external_id, customer_phone, priority,
               delivery_date_estimate::text AS delivery_date_estimate,
               notes, invoice_terms, invoice_notes
        FROM orders WHERE id = ${id}
    `;

    try {
        // COALESCE con el valor actual: así un patch parcial no pisa lo demás.
        // Para los campos que sí se pueden vaciar mandamos '' y lo pasamos a NULL.
        await sql`
            UPDATE orders SET
                customer_name = CASE
                    WHEN ${patch.customer_name === undefined} THEN customer_name
                    WHEN ${patch.customer_name ?? ''} = '' THEN NULL
                    ELSE ${patch.customer_name ?? null}
                END,
                customer_external_id = CASE
                    WHEN ${patch.customer_external_id === undefined} THEN customer_external_id
                    WHEN ${patch.customer_external_id ?? ''} = '' THEN NULL
                    ELSE ${patch.customer_external_id ?? null}
                END,
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
                END,
                invoice_terms = CASE
                    WHEN ${patch.invoice_terms === undefined} THEN invoice_terms
                    WHEN ${patch.invoice_terms ?? ''} = '' THEN NULL
                    ELSE ${patch.invoice_terms ?? null}
                END,
                invoice_notes = CASE
                    WHEN ${patch.invoice_notes === undefined} THEN invoice_notes
                    WHEN ${patch.invoice_notes ?? ''} = '' THEN NULL
                    ELSE ${patch.invoice_notes ?? null}
                END
            WHERE id = ${id}
        `;
        if (patch.delivery_date_estimate !== undefined) {
            await sql`UPDATE orders SET delivery_date_verified_at = NOW() WHERE id = ${id}`;
        }

        // Un evento por campo que REALMENTE cambió. Guardar un evento por cada
        // campo del patch llenaría la historia de "cambió el teléfono" cuando
        // alguien entró al campo y salió sin tocar nada.
        const normalizar = (v: unknown) => {
            const t = v == null ? '' : String(v).trim();
            return t === '' ? null : t;
        };
        await logOrderEvents(
            id,
            (Object.keys(patch) as (keyof typeof patch)[])
                .map((campo) => ({
                    campo,
                    viejo: normalizar(antes?.[campo]),
                    nuevo: normalizar(patch[campo]),
                }))
                .filter(({ viejo, nuevo }) => viejo !== nuevo)
                .map(({ campo, viejo, nuevo }) => ({
                    kind: 'field' as const,
                    field: campo,
                    oldValue: viejo,
                    newValue: nuevo,
                })),
        );

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
// Los ítems se pueden editar AUNQUE el pedido ya esté facturado. Antes las tres
// acciones (editar, quitar, agregar) se negaban si había alegra_invoice_id, para
// que la factura no quedara desalineada. Se sacó a pedido del taller: la corrección
// tiene que poder hacerse acá y la factura se ajusta a mano en Alegra.
export async function updateOrderItem(
    itemId: number,
    patch: { quantity?: number; specs?: Record<string, string> },
): Promise<import('@/lib/orders').UpdateOrderItemResult> {
    const session = await auth();
    if (!session?.user) return { ok: false, error: 'No autenticado' };

    const [item] = await sql`SELECT order_id, product, quantity, specs FROM order_items WHERE id = ${itemId}`;
    if (!item) return { ok: false, error: 'La línea no existe' };

    const result = await updateOrderItemInternal(itemId, patch);
    if (result.ok) {
        await markDocumentsStale(item.order_id);
        const cambioCantidad =
            patch.quantity !== undefined && Number(patch.quantity) !== Number(item.quantity);

        // Qué opción cambió y de qué a qué. Antes el evento decía solo "cambió las
        // opciones de Optic 1": para saber qué se había tocado había que acordarse.
        // Se nombran con las etiquetas del vocabulario, igual que las columnas.
        const diff = patch.specs ? await diffSpecs((item.specs ?? {}) as Record<string, string>, patch.specs) : [];

        await logOrderEvent(item.order_id, {
            kind: 'item_updated',
            field: cambioCantidad ? 'quantity' : 'specs',
            oldValue: cambioCantidad
                ? `${item.quantity} × ${item.product}`
                : diff.map((d) => `${d.label} ${d.antes}`).join(', ') || item.product,
            newValue: cambioCantidad
                ? `${patch.quantity} × ${item.product}`
                : diff.map((d) => `${d.label} ${d.despues}`).join(', ') || item.product,
            // El producto va aparte: el hilo lo necesita para saber de qué línea
            // habla, y en oldValue/newValue solo van los valores que cambiaron.
            body: cambioCantidad || diff.length === 0 ? null : item.product,
        });
        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${item.order_id}`);
    }
    return result;
}

export async function deleteOrderItem(itemId: number): Promise<import('@/lib/orders').DeleteOrderItemResult> {
    const session = await auth();
    if (!session?.user) return { ok: false, error: 'No autenticado' };

    // Se lee el producto ANTES de borrarlo: después ya no hay qué nombrar.
    const [item] = await sql`SELECT order_id, product, quantity FROM order_items WHERE id = ${itemId}`;
    if (!item) return { ok: false, error: 'La línea no existe' };

    const result = await deleteOrderItemInternal(itemId);
    if (result.ok) {
        await markDocumentsStale(item.order_id);
        await logOrderEvent(item.order_id, {
            kind: 'item_removed',
            oldValue: `${item.quantity} × ${item.product}`,
        });
        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${item.order_id}`);
    }
    return result;
}

// Agregar una línea a un pedido existente. Acá SÍ tomamos la receta vigente:
// es una línea nueva, se congela en este momento.
export async function addOrderItem(
    orderId: number,
    payload: { product: string; quantity: number; specs?: Record<string, string> },
): Promise<import('@/lib/orders').AddOrderItemResult> {
    const session = await auth();
    if (!session?.user) return { ok: false, error: 'No autenticado' };

    const result = await addOrderItemInternal(orderId, payload);
    if (result.ok) {
        await markDocumentsStale(orderId);
        await logOrderEvent(orderId, {
            kind: 'item_added',
            newValue: `${payload.quantity} × ${payload.product}`,
        });
        revalidatePath('/pedidos');
        revalidatePath(`/pedidos/${orderId}`);
    }
    return result;
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
        revalidatePath('/settings/variaciones');
        revalidatePath('/materials/familias');
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
        revalidatePath('/settings/variaciones');
        revalidatePath('/materials/familias');
        revalidatePath('/fichas');
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

        await logOrderEvent(orderId, {
            kind: 'materials_consumed',
            newValue: String(aDescontar.length),
        });

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

// Dejar una nota en el pedido. No se edita ni se borra: si se pudiera cambiar
// después, la historia dejaría de servir justo cuando hace falta.
export async function addOrderNote(orderId: number, body: string) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    const texto = body.trim();
    if (!texto) return { error: 'La nota está vacía' };
    if (texto.length > 2000) return { error: 'La nota es demasiado larga' };

    const [order] = await sql`SELECT id FROM orders WHERE id = ${orderId}`;
    if (!order) return { error: 'El pedido no existe' };

    await logOrderEvent(orderId, { kind: 'note', body: texto });
    revalidatePath(`/pedidos/${orderId}`);
    return { ok: true };
}
