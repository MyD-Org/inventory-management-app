'use server';

// Server actions de la vista manual de pedidos y del vocabulario de specs.
// Mismo patrón que lib/budget-actions.ts: auth() por acción, revalidatePath al mutar.
// La creación de pedidos delega en lib/orders.ts, el mismo código que usa la API,
// para que cargar un pedido a mano y recibirlo del bot den el mismo resultado.

import { revalidatePath } from 'next/cache';
import { del } from '@vercel/blob';
import { auth } from '@/auth';
import { addEventPhotos, eventPhotoPaths, logOrderEvent, logOrderEvents } from '@/lib/order-events';
import { sql } from '@/lib/database';
import { invoiceOrder } from '@/lib/invoicing';
import { deliverableItems, remitOrder } from '@/lib/remissions';
import { describeDelivery, describePendingDelivery, pendingQuantity } from '@/lib/deliveries';
import {
    addOrderItemInternal,
    consumedMaterials,
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
import { acceptsItemChanges, isFixedSpecField, STATUS_LABELS } from '@/lib/order-statuses';
import { canConsumeStock } from '@/lib/roles';
import { requireOperator } from '@/lib/operators';
import { planReturn } from '@/lib/returns';

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

/**
 * El pedido está cerrado a cambios de líneas: ya salió del taller.
 *
 * Se chequea en el servidor y no solo escondiendo el botón: la pantalla se pudo
 * haber abierto antes de que el pedido pasara a listo para retirar, y el que la
 * tiene abierta no se entera.
 */
async function itemsCongelados(orderId: number): Promise<string | null> {
    const [order] = await sql`SELECT status FROM orders WHERE id = ${orderId}`;
    if (!order || acceptsItemChanges(order.status as string)) return null;
    const etiqueta = STATUS_LABELS[order.status as keyof typeof STATUS_LABELS] ?? order.status;
    return `El pedido está en "${etiqueta}": ya no admite cambios en sus productos.`;
}

export async function updateOrderStatus(id: number, status: string) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };
    if (!ORDER_STATUSES.includes(status as any)) return { error: 'Estado inválido' };

    try {
        // No se puede pasar a listo para retirar sin los dos papeles hechos: son
        // el paso previo obligatorio del flujo. Ahí el pedido deja de ser trabajo
        // del taller y pasa a ser mercadería esperando a que la retiren.
        if (status === 'listo_para_retirar') {
            const [order] = await sql`SELECT alegra_invoice_id FROM orders WHERE id = ${id}`;
            if (!order?.alegra_invoice_id) {
                return { error: 'Falta emitir la factura antes de pasar a listo para retirar.' };
            }

            // Y TODO remitido. Puede estar repartido en varios remitos —la entrega
            // va por partes y cada salida es su papel— pero no puede quedar nada
            // adentro: lo que ningún remito nombra sale del depósito sin respaldo,
            // y el que carga la camioneta no tiene contra qué contar los bultos.
            const pendiente = describePendingDelivery(await deliverableItems(id));
            if (pendiente) {
                return { error: `Falta remitir antes de pasar a listo para retirar: ${pendiente}.` };
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

        // Al pasar a 'por_facturar' intentamos emitir los DOS documentos en Alegra
        // de forma automática: la factura y el remito. Si alguno falla, el estado
        // cambia igual y queda visible el botón manual para reintentar.
        //
        // SE EMITE LO QUE FALTE, no lo que no haya: cualquiera de los dos puede
        // haberse emitido antes desde el botón, en cualquier orden, y no se pisa.
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

            // El remito, con el mismo criterio. Va DESPUÉS de la factura a propósito:
            // así, cuando los dos salen juntos, el remito ya puede nombrarla en sus
            // observaciones —al revés la factura no tendría a quién nombrar—.
            //
            // LA CONDICIÓN ES LO PENDIENTE, no "si ya hay remito": un pedido puede
            // tener remito y todavía tener mercadería adentro, porque la entrega va
            // por partes. Lo que se emite acá es un remito por TODO lo que falte
            // entregar; si no falta nada, no hay documento que emitir.
            const pendiente = (await deliverableItems(id)).some((i) => pendingQuantity(i) > 0);
            if (pendiente) {
                try {
                    const result = await remitOrder(id, null, { name: 'Sistema' });
                    if (result.remissionId != null) {
                        await logOrderEvent(id, {
                            kind: 'invoice',
                            field: 'remito',
                            newValue: result.remissionNumber ?? String(result.remissionId),
                            // Cuánto quedó remitido: con remitos parciales el
                            // número del papel solo no dice si salió todo.
                            body: describeDelivery(
                                result.delivery.map((d) => ({
                                    id: d.orderItemId,
                                    product: d.product,
                                    quantity: d.ordered,
                                    delivered: d.delivered,
                                })),
                            ),
                            actor: { name: 'Sistema' },
                        });
                    }
                } catch (err) {
                    // El aviso de la factura no se pisa: si las dos fallaron, la que
                    // frena la salida del pedido es la factura.
                    console.error('Error remitiendo automáticamente:', err);
                    warning = warning ?? (err instanceof Error ? err.message : 'Error al emitir el remito automáticamente.');
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

        // 'other' y compañía existen siempre: no se re-crean a mano.
        if (isFixedSpecField(cleanKey)) {
            return { error: `"${cleanKey}" es un campo fijo del pedido: ya existe y no se administra desde acá` };
        }

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

    // Un campo fijo no se oculta: la app asume que está.
    if (isFixedSpecField(key)) return { error: 'Es un campo fijo del pedido: no se puede ocultar' };

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

// ¿El asistente del CRM le ofrece elegir este campo al cliente?
//
// DISTINTO DE `active`: un campo interno sigue existiendo, se sigue completando en
// el pedido y las familias lo siguen usando para elegir material. Lo único que
// cambia es que el bot no lo pregunta. Ver scripts/30-variaciones-internas.sql.
export async function toggleSpecFieldOffered(key: string, offered: boolean) {
    const session = await auth();
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede editar esto' };

    try {
        await sql`UPDATE spec_fields SET offered_to_customer = ${offered} WHERE key = ${key}`;
        revalidatePath('/settings/variaciones');
        return { ok: true };
    } catch (error) {
        console.error('Error en toggleSpecFieldOffered:', error);
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
        reference?: string | null;
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
               reference, notes, invoice_terms, invoice_notes
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
                reference = CASE
                    WHEN ${patch.reference === undefined} THEN reference
                    WHEN ${patch.reference?.trim() ?? ''} = '' THEN NULL
                    ELSE ${patch.reference?.trim() ?? null}
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
    patch: { quantity?: number; specs?: Record<string, string>; product?: string },
): Promise<import('@/lib/orders').UpdateOrderItemResult> {
    const session = await auth();
    if (!session?.user) return { ok: false, error: 'No autenticado' };

    const [item] = await sql`
        SELECT order_id, product, quantity, specs FROM order_items WHERE id = ${itemId}
    `;
    if (!item) return { ok: false, error: 'La línea no existe' };

    const congelado = await itemsCongelados(item.order_id as number);
    if (congelado) return { ok: false, error: congelado };

    const result = await updateOrderItemInternal(itemId, patch);
    if (result.ok) {
        await markDocumentsStale(item.order_id);

        // El cambio de producto se registra aparte: rehace la receta entera, así
        // que en el hilo tiene que leerse como tal y no como "cambió un dato".
        const [actualizado] = await sql`SELECT product FROM order_items WHERE id = ${itemId}`;
        if (actualizado && actualizado.product !== item.product) {
            await logOrderEvent(item.order_id, {
                kind: 'item_updated',
                field: 'product',
                oldValue: item.product,
                newValue: actualizado.product,
            });
            revalidatePath('/pedidos');
            revalidatePath(`/pedidos/${item.order_id}`);
            return result;
        }

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
    const [item] = await sql`
        SELECT order_id, product, quantity FROM order_items WHERE id = ${itemId}
    `;
    if (!item) return { ok: false, error: 'La línea no existe' };

    const congelado = await itemsCongelados(item.order_id as number);
    if (congelado) return { ok: false, error: congelado };

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

    const congelado = await itemsCongelados(orderId);
    if (congelado) return { ok: false, error: congelado };

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

/**
 * Marcar (o desmarcar) que una línea del pedido se le entregó al cliente.
 *
 * SOLO SOBRE LO REMITIDO: entregar algo sin papel es lo que el circuito no quiere,
 * así que una línea sin remito no se puede marcar. El check escribe lo remitido y
 * destildar escribe 0; quien marca no tipea ninguna cantidad (por qué se guarda un
 * número y no un sí/no, ver scripts/42-entrega-al-cliente.sql).
 *
 * NO PASA POR itemsCongelados, y no es un olvido: un pedido en "Listo para retirar"
 * tiene las líneas congeladas —no se le cambian productos ni cantidades— y es
 * EXACTAMENTE el estado en el que alguien viene a buscar la mercadería. Congelar
 * también el check dejaría la función sin el único momento en que se usa.
 */
export async function setItemHandedOver(itemId: number, entregado: boolean) {
    const session = await auth();
    if (!session?.user) return { ok: false as const, error: 'No autenticado' };

    const [item] = await sql`
        SELECT order_id, product, quantity, delivered_quantity, handed_over_quantity
        FROM order_items WHERE id = ${itemId}
    `;
    if (!item) return { ok: false as const, error: 'La línea no existe' };

    const remitido = Number(item.delivered_quantity ?? 0);
    if (remitido <= 0) {
        return { ok: false as const, error: 'Esa línea todavía no tiene remito: no se puede marcar como entregada.' };
    }

    // Marcar lo que ya estaba marcado no es un cambio y no deja evento: dos clicks
    // seguidos —o un reintento del navegador— llenaban el historial de renglones
    // repetidos que decían todos lo mismo.
    const objetivo = entregado ? remitido : 0;
    if (Math.abs(Number(item.handed_over_quantity ?? 0) - objetivo) < 0.005) {
        return { ok: true as const };
    }

    await sql`
        UPDATE order_items SET handed_over_quantity = ${objetivo}
        WHERE id = ${itemId}
    `;
    await logOrderEvent(item.order_id as number, {
        kind: 'handover',
        field: 'entrega',
        newValue: `${remitido} × ${item.product}`,
        body: entregado ? null : 'desmarcada',
    });

    revalidatePath('/pedidos');
    revalidatePath(`/pedidos/${item.order_id}`);
    return { ok: true as const };
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

    if (isFixedSpecField(key)) return { error: 'Es un campo fijo del pedido: no se puede borrar' };

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
    // Quién retira, que no es lo mismo que con qué cuenta se entró: el taller
    // trabaja con una sesión compartida. Ver lib/operators.ts.
    operatorId?: number | null,
) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };
    // El rol "Solo pedidos" mira, no retira. Va acá y no solo en el botón: la
    // action se puede llamar sin pasar por la pantalla.
    if (!canConsumeStock(session.user.role)) {
        return { error: 'Tu usuario no puede descontar materiales del inventario' };
    }

    const aDescontar = items.filter((i) => Number.isFinite(i.quantity) && i.quantity > 0);
    if (aDescontar.length === 0) return { error: 'No hay nada para descontar' };

    const conOperario = await requireOperator(operatorId, session.user.role);
    if ('error' in conOperario) return { error: conOperario.error };
    const operario = conOperario.operario;

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
                    reference_number, notes, user_name, order_id,
                    operator_id, operator_name
                )
                VALUES (
                    ${item.material_id}, 'salida', ${item.quantity}, ${previo}, ${nuevo},
                    ${`Pedido #${order.order_number}`},
                    ${nota},
                    ${userName}, ${orderId},
                    ${operario?.id ?? null}, ${operario?.name ?? null}
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

        // Cantidad con decimales contra columnas INTEGER: es el caso que arregla
        // scripts/32-stock-decimal.sql. Sin este mensaje el error no dice nada.
        const { code, message } = (error ?? {}) as { code?: string; message?: string };
        if (code === '22P02' && /integer/i.test(message ?? '')) {
            return {
                error:
                    'El inventario todavía no acepta cantidades con decimales. Falta aplicar la migración de stock fraccionado (scripts/32-stock-decimal.sql).',
            };
        }

        return {
            error: 'No se pudo descontar del inventario',
            detail: process.env.NODE_ENV === 'production' ? undefined : message,
        };
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
                -- Neto: lo devuelto al depósito vuelve a estar pendiente, así el
                -- pedido reaparece en "descontar los materiales de un pedido".
                HAVING SUM(oim.qty_total) > COALESCE((
                    SELECT SUM(
                        CASE WHEN sm.movement_type = 'salida' THEN sm.quantity ELSE -sm.quantity END
                    ) FROM stock_movements sm
                    WHERE sm.order_id = o.id AND sm.material_id = oim.material_id
                      AND sm.movement_type IN ('salida', 'entrada')
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

// Lo que hoy está afuera del depósito por este pedido, para armar la devolución.
export async function getOrderConsumed(orderId: number) {
    const session = await auth();
    if (!session?.user) return [];
    return consumedMaterials(orderId);
}

// Devolver al inventario material que se había retirado por un pedido: el taller
// sacó 3 placas, al final no van, y vuelven al estante.
//
// Se registra como una ENTRADA vinculada al pedido, sin tocar la salida original:
// en el historial del inventario quedan los dos movimientos, que es lo que pasó de
// verdad. Lo consumido por el pedido es el neto de ambos, así que la lista de
// materiales vuelve a mostrar el material como pendiente.
//
// El tope es lo NETO retirado por este pedido, no el stock: no se puede devolver
// lo que este pedido nunca sacó. Devolver de más sería una entrada de material que
// vino de otro lado, y eso es un ajuste de inventario, no una devolución.
export async function returnOrderMaterials(
    orderId: number,
    items: { material_id: number; quantity: number }[],
    /** Quién devuelve. Mismo criterio que al retirar. */
    operatorId?: number | null,
) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };
    // Mismo permiso que retirar: quien puede sacar del depósito puede devolverlo.
    // El rol "Solo pedidos" no toca el stock en ninguna dirección.
    if (!canConsumeStock(session.user.role)) {
        return { error: 'Tu usuario no puede mover materiales del inventario' };
    }

    const conOperario = await requireOperator(operatorId, session.user.role);
    if ('error' in conOperario) return { error: conOperario.error };
    const operario = conOperario.operario;

    const userName = session.user.name || session.user.email || 'Desconocido';

    try {
        const [order] = await sql`
            SELECT order_number FROM orders WHERE id = ${orderId}
        `;
        if (!order) return { error: 'El pedido no existe' };

        // Se valida TODO contra lo retirado antes de tocar nada, igual que al
        // descontar: media devolución aplicada es peor que ninguna. La regla vive
        // en lib/returns.ts, sin base de datos.
        const plan = planReturn(await consumedMaterials(orderId), items);
        if ('error' in plan) return { error: plan.error };
        const aDevolver = plan.items;

        for (const item of aDevolver) {
            const [inv] = await sql`
                SELECT current_stock FROM inventory WHERE material_id = ${item.material_id}
            `;
            if (!inv) return { error: 'Ese material ya no está en el inventario' };
            const previo = Number(inv.current_stock);
            const nuevo = previo + item.quantity;

            await sql`
                INSERT INTO stock_movements (
                    material_id, movement_type, quantity, previous_stock, new_stock,
                    reference_number, notes, user_name, order_id,
                    operator_id, operator_name
                )
                VALUES (
                    ${item.material_id}, 'entrada', ${item.quantity}, ${previo}, ${nuevo},
                    ${`Pedido #${order.order_number}`},
                    ${`Devolución al depósito de material retirado por el pedido #${order.order_number}`},
                    ${userName}, ${orderId},
                    ${operario?.id ?? null}, ${operario?.name ?? null}
                )
            `;
            await sql`
                UPDATE inventory SET current_stock = ${nuevo}, last_updated = NOW()
                WHERE material_id = ${item.material_id}
            `;
        }

        // logOrderEvent traga sus propios errores a propósito, así que si falta
        // aplicar la migración que suma 'materials_returned' al CHECK, la
        // devolución igual queda hecha: lo único que se pierde es el renglón en la
        // actividad del pedido. El movimiento de inventario, que es el dato duro,
        // queda igual en /movimientos.
        await logOrderEvent(orderId, {
            kind: 'materials_returned',
            newValue: String(aDevolver.length),
        });

        revalidatePath(`/pedidos/${orderId}`);
        revalidatePath('/inventory');
        revalidatePath('/movimientos');
        return { ok: true, count: aDevolver.length };
    } catch (error) {
        console.error('Error en returnOrderMaterials:', error);
        const { message } = (error ?? {}) as { message?: string };

        return {
            error: 'No se pudo devolver al inventario',
            detail: process.env.NODE_ENV === 'production' ? undefined : message,
        };
    }
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
            SELECT m.id, m.name, m.barcode, COALESCE(i.available_stock, 0) AS available
            FROM materials m
            LEFT JOIN inventory i ON i.material_id = m.id
            WHERE m.name ILIKE ${`%${term}%`} OR m.barcode ILIKE ${`%${term}%`}
            ORDER BY
                -- El código exacto primero: es lo que devuelve la cámara, y si
                -- queda sepultado entre parecidos hay que buscarlo a ojo.
                CASE WHEN m.barcode = ${term} THEN 0 ELSE 1 END,
                m.name ASC
            LIMIT 8
        `;
        return (rows as any[]).map((r) => ({
            material_id: r.id as number,
            label: r.name as string,
            barcode: (r.barcode as string | null) ?? '',
            available: Number(r.available),
        }));
    } catch (error) {
        console.error('Error en searchInventoryMaterials:', error);
        return [];
    }
}

// Dejar una nota en el pedido. No se edita ni se borra: si se pudiera cambiar
// después, la historia dejaría de servir justo cuando hace falta.
/** Una foto ya subida al Blob, tal como la devuelve el cliente. */
export interface NotePhotoInput {
    url: string;
    pathname: string;
    width?: number | null;
    height?: number | null;
}

// Cuántas fotos entran en una nota. El límite es de encuadre, no técnico: si
// hacen falta más de ocho fotos para explicar algo, son varias notas.
const MAX_FOTOS = 8;

export async function addOrderNote(orderId: number, body: string, photos: NotePhotoInput[] = []) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    const texto = body.trim();
    // Una nota puede ser SOLO una foto: "así llegó la pieza" no necesita texto.
    // Lo que no puede es estar vacía de las dos cosas.
    if (!texto && photos.length === 0) return { error: 'La nota está vacía' };
    if (texto.length > 2000) return { error: 'La nota es demasiado larga' };
    if (photos.length > MAX_FOTOS) {
        return { error: `No se pueden adjuntar más de ${MAX_FOTOS} fotos en una nota` };
    }

    // Las URL tienen que ser del Blob de este proyecto. El cliente las manda, y
    // sin este control cualquiera con sesión podría dejar apuntada la nota a una
    // imagen de afuera, que después el pedido pintaría como propia.
    const fueraDeLugar = photos.find((f) => !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//.test(f.url));
    if (fueraDeLugar) return { error: 'Una de las fotos no es del almacenamiento de la app' };

    const [order] = await sql`SELECT id FROM orders WHERE id = ${orderId}`;
    if (!order) return { error: 'El pedido no existe' };

    const eventId = await logOrderEvent(orderId, { kind: 'note', body: texto });
    // Sin id no hay a qué colgar las fotos. La nota ya se perdió (logOrderEvent
    // no voltea la operación), así que decirlo es mejor que guardar una nota
    // muda con las fotos sueltas.
    if (photos.length > 0) {
        if (!eventId) return { error: 'No se pudo guardar la nota' };
        await addEventPhotos(eventId, photos);
    }

    revalidatePath(`/pedidos/${orderId}`);
    return { ok: true };
}

// Borrar una nota. Solo la propia, o cualquiera si sos admin: una nota es lo que
// alguien escribió a mano, no un cambio de campo — el resto de la historia no se
// toca desde ningún lado.
//
// El borrado es de verdad (DELETE, no un flag): lo que se quiere es que el
// mensaje desaparezca de la pantalla del pedido, y una nota tachada seguiría
// contando lo que se quiso sacar.
export async function deleteOrderNote(orderId: number, eventId: number) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    const [nota] = await sql`
        SELECT id, actor_email FROM order_events
        WHERE id = ${eventId} AND order_id = ${orderId} AND kind = 'note'
    `;
    if (!nota) return { error: 'La nota no existe' };

    const email = session.user.email ?? null;
    const esAutor = Boolean(email) && nota.actor_email === email;
    if (!esAutor && session.user.role !== 'admin') {
        return { error: 'Solo podés borrar tus propias notas' };
    }

    // Los archivos primero, porque después de borrar la fila ya no se sabe
    // cuáles eran. El CASCADE de la migración 39 limpia la tabla, no el Blob.
    const paths = await eventPhotoPaths(eventId);

    await sql`DELETE FROM order_events WHERE id = ${eventId}`;

    if (paths.length > 0) {
        // Un archivo que no se pudo borrar del Blob NO puede resucitar la nota:
        // lo que se pidió es que el mensaje desaparezca del pedido, y ya
        // desapareció. Queda un huérfano en el store y se loguea.
        try {
            await del(paths);
        } catch (error) {
            console.error('No se pudieron borrar las fotos de la nota del Blob:', error);
        }
    }

    revalidatePath(`/pedidos/${orderId}`);
    return { ok: true };
}
