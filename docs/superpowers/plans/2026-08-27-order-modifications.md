# Modificación de pedidos por API y seguimiento de revisión

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el bot/CRM agregue o modifique ítems de pedidos existentes solo en estados tempranos, marcar el pedido como modificado para revisión de fecha de entrega, y mostrar el aviso en el tablero Kanban.

**Architecture:** Se agregan dos columnas a `orders` (`modified_at`, `delivery_date_verified_at`) para saber si un cambio por API todavía no fue revisado. Nuevos endpoints REST bajo `/api/pedidos/[id]/items` manejan agregar, modificar y quitar ítems con restricción de estado. La lógica de ítems se centraliza en `lib/orders.ts` como funciones internas (sin auth) para que la API y las server actions la reutilicen. Las server actions de la web agregan auth, validación de factura emitida y revalidación de cache. La web ajusta `delivery_date_verified_at` al tocar la fecha. El tablero muestra un badge cuando `modified_at > delivery_date_verified_at`.

**Tech Stack:** Next.js 14 App Router, React server/client components, TypeScript, @neondatabase/serverless (`sql`), Tailwind CSS, shadcn/ui.

---

## File map

| File | Responsibility |
|---|---|
| `scripts/18-order-modifications.sql` | Migración: columnas `modified_at` y `delivery_date_verified_at` en `orders`. |
| `lib/orders.ts` | Tipos, `readOrder`, helpers de estado permitido, cálculo de `needs_review`, y funciones internas de ítems. |
| `app/api/pedidos/[id]/items/route.ts` | POST para agregar ítem por API. |
| `app/api/pedidos/[id]/items/[itemId]/route.ts` | PATCH y DELETE para ítems por API. |
| `app/api/pedidos/route.ts` | GET incluye `needs_review` en cada pedido. |
| `lib/order-actions.ts` | Server actions de la web: envuelven funciones internas con auth, bloqueo por factura y revalidación. |
| `app/(pedidos)/pedidos/page.tsx` | Query del tablero incluye las nuevas columnas. |
| `components/orders-board.tsx` | Muestra badge "modificado" en la tarjeta. |
| `app/(pedidos)/pedidos/[id]/page.tsx` | Pasa `needs_review` y `alegra_invoice_id` al editor; muestra banner. |
| `components/order-items-editor.tsx` | Recibe `highlightedItemId` y prop de solo lectura; resalta fila nueva. |
| `components/order-props-editor.tsx` | `DateField` actualiza `delivery_date_verified_at`. |

---

### Task 1: Migración de base de datos

**Files:**
- Create: `scripts/18-order-modifications.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Modificación de pedidos por API y seguimiento de revisión de fecha.
-- Agrega timestamps para saber si un cambio por API todavía no fue revisado.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS delivery_date_verified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_orders_modified_at ON orders(modified_at);
```

- [ ] **Step 2: Aplicar en local**

Run: `node scripts/run-sql.js scripts/18-order-modifications.sql`
Expected: sin errores; columnas nuevas presentes.

- [ ] **Step 3: Commit**

```bash
git add scripts/18-order-modifications.sql
git commit -m "feat(db): add modified_at and delivery_date_verified_at to orders"
```

---

### Task 2: Actualizar tipos, helpers y funciones internas en lib/orders.ts

**Files:**
- Modify: `lib/orders.ts`

- [ ] **Step 1: Agregar campos al tipo Order**

En la interfaz `Order` (alrededor de línea 193), agregar:

```typescript
modified_at: string | null
delivery_date_verified_at: string | null
```

- [ ] **Step 2: Actualizar readOrder**

En el `SELECT` de `readOrder`, agregar:

```typescript
const [order] = await sql`
    SELECT id, order_number, external_id, origin, customer_external_id, customer_name,
           customer_phone, status, priority,
           delivery_date_estimate::text AS delivery_date_estimate,
           source_conversation, notes, invoice_terms, invoice_notes, created_at, updated_at,
           alegra_invoice_id, alegra_invoice_number, invoice_warnings,
           modified_at::text AS modified_at,
           delivery_date_verified_at::text AS delivery_date_verified_at
    FROM orders WHERE id = ${orderId}
`
```

El return ya usa spread de `order as any`, así que con el SELECT correcto los campos llegan al objeto.

- [ ] **Step 3: Agregar helper de estados editables por API y needs_review**

Agregar al final de la sección de lectura (antes de `// ---------- Escritura ----------`):

```typescript
export const API_EDITABLE_STATUSES: OrderStatus[] = ["por_revisar", "recibido", "en_proceso"]

export function isApiEditable(status: OrderStatus): boolean {
    return API_EDITABLE_STATUSES.includes(status)
}

export function orderNeedsReview(order: {
    modified_at: string | null
    delivery_date_verified_at: string | null
}): boolean {
    if (!order.modified_at) return false
    if (!order.delivery_date_verified_at) return true
    return new Date(order.modified_at) > new Date(order.delivery_date_verified_at)
}
```

- [ ] **Step 4: Extraer funciones internas de ítems**

Mover el cuerpo de `addOrderItem`, `updateOrderItem` y `deleteOrderItem` desde `lib/order-actions.ts` a `lib/orders.ts` como funciones sin auth ni revalidación:

```typescript
export async function addOrderItemInternal(
    orderId: number,
    payload: { product: string; quantity: number; specs?: Record<string, string> },
) {
    if (!payload.product?.trim()) return { error: "Elegí un producto" };
    if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) return { error: "Cantidad inválida" };

    const errors = validateSpecs(payload.specs ?? {}, await getSpecs());
    if (errors.length > 0) return { error: errors.join(". ") };

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

        return {
            ok: true,
            itemId: line.id as number,
            needs_review: !resolved?.budgetId,
            unmapped,
            sin_alegra: !resolved?.alegraItemId,
        };
    } catch (error) {
        console.error("Error en addOrderItemInternal:", error);
        return { error: "No se pudo agregar la línea" };
    }
}

export async function updateOrderItemInternal(
    itemId: number,
    patch: { quantity?: number; specs?: Record<string, string> },
) {
    try {
        const [item] = await sql`SELECT order_id, quantity, budget_id, specs FROM order_items WHERE id = ${itemId}`;
        if (!item) return { error: "La línea no existe" };

        if (patch.specs) {
            const errors = validateSpecs(patch.specs, await getSpecs());
            if (errors.length > 0) return { error: errors.join(". ") };
        }

        const quantity = patch.quantity ?? Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Cantidad inválida" };

        await sql`
            UPDATE order_items SET
                quantity = ${quantity},
                specs = COALESCE(${patch.specs ? JSON.stringify(patch.specs) : null}::jsonb, specs)
            WHERE id = ${itemId}
        `;

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

        const reexploded = specsChanged && Boolean(item.budget_id) && !consumed;
        if (!reexploded && patch.quantity !== undefined) {
            await sql`
                UPDATE order_item_materials
                SET qty_total = qty_per_unit * ${quantity}
                WHERE order_item_id = ${itemId}
            `;
        }

        if (consumed) {
            return {
                ok: true,
                itemId,
                warning:
                    "Se guardaron los cambios, pero los materiales no se recalcularon porque este pedido ya descontó stock. Revisá el descuento a mano.",
            };
        }
        return { ok: true, itemId };
    } catch (error) {
        console.error("Error en updateOrderItemInternal:", error);
        return { error: "No se pudo guardar la línea" };
    }
}

export async function deleteOrderItemInternal(itemId: number) {
    try {
        const [item] = await sql`SELECT order_id FROM order_items WHERE id = ${itemId}`;
        if (!item) return { error: "La línea no existe" };

        const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = ${item.order_id}`;
        if (count <= 1) return { error: "Un pedido no puede quedar sin líneas" };

        await sql`DELETE FROM order_items WHERE id = ${itemId}`;
        return { ok: true, itemId };
    } catch (error) {
        console.error("Error en deleteOrderItemInternal:", error);
        return { error: "No se pudo borrar la línea" };
    }
}
```

Asegurarse de importar `sameSpecs` en `lib/orders.ts` si no está:

```typescript
import { resolveBom, type BomLine, type BomOption } from "@/lib/bom"
```

ya está. `sameSpecs` viene de `@/lib/bom`, así que agregar:

```typescript
import { resolveBom, sameSpecs, type BomLine, type BomOption } from "@/lib/bom"
```

- [ ] **Step 5: Verificar types**

Run: `npx tsc --noEmit`
Expected: mismo error previo en `lib/alegra-import.ts`; ninguno nuevo en `lib/orders.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/orders.ts
git commit -m "feat(orders): add internal item functions and review helpers"
```

---

### Task 3: Actualizar server actions para usar funciones internas

**Files:**
- Modify: `lib/order-actions.ts`

- [ ] **Step 1: Importar funciones internas**

Al inicio de `lib/order-actions.ts`, agregar a los imports:

```typescript
import {
    addOrderItemInternal,
    createOrder,
    deleteOrderItemInternal,
    explodeBom,
    getSpecs,
    listSellableProducts,
    materialNeeds,
    ORDER_PRIORITIES,
    ORDER_STATUSES,
    resolveProduct,
    updateOrderItemInternal,
    validateOrderPayload,
    validateSpecs,
    type OrderPayload,
} from "@/lib/orders";
```

- [ ] **Step 2: Reemplazar addOrderItem para usar la interna**

El cuerpo de `addOrderItem` queda:

```typescript
export async function addOrderItem(
    orderId: number,
    payload: { product: string; quantity: number; specs?: Record<string, string> },
) {
    const session = await auth();
    if (!session?.user) return { error: "No autenticado" };

    const [order] = await sql`SELECT alegra_invoice_id FROM orders WHERE id = ${orderId}`;
    if (order?.alegra_invoice_id) {
        return { error: "El pedido ya fue facturado: no se pueden agregar ítems" };
    }

    const result = await addOrderItemInternal(orderId, payload);
    if (!result.error) {
        revalidatePath("/pedidos");
        revalidatePath(`/pedidos/${orderId}`);
    }
    return result;
}
```

- [ ] **Step 3: Reemplazar updateOrderItem para usar la interna**

El cuerpo de `updateOrderItem` queda:

```typescript
export async function updateOrderItem(
    itemId: number,
    patch: { quantity?: number; specs?: Record<string, string> },
) {
    const session = await auth();
    if (!session?.user) return { error: "No autenticado" };

    const [item] = await sql`SELECT order_id FROM order_items WHERE id = ${itemId}`;
    if (!item) return { error: "La línea no existe" };

    const [order] = await sql`SELECT alegra_invoice_id FROM orders WHERE id = ${item.order_id}`;
    if (order?.alegra_invoice_id) {
        return { error: "El pedido ya fue facturado: no se pueden modificar ítems" };
    }

    const result = await updateOrderItemInternal(itemId, patch);
    if (!result.error) {
        revalidatePath("/pedidos");
        revalidatePath(`/pedidos/${item.order_id}`);
    }
    return result;
}
```

- [ ] **Step 4: Reemplazar deleteOrderItem para usar la interna**

El cuerpo de `deleteOrderItem` queda:

```typescript
export async function deleteOrderItem(itemId: number) {
    const session = await auth();
    if (!session?.user) return { error: "No autenticado" };

    const [item] = await sql`SELECT order_id FROM order_items WHERE id = ${itemId}`;
    if (!item) return { error: "La línea no existe" };

    const [order] = await sql`SELECT alegra_invoice_id FROM orders WHERE id = ${item.order_id}`;
    if (order?.alegra_invoice_id) {
        return { error: "El pedido ya fue facturado: no se pueden quitar ítems" };
    }

    const result = await deleteOrderItemInternal(itemId);
    if (!result.error) {
        revalidatePath("/pedidos");
        revalidatePath(`/pedidos/${item.order_id}`);
    }
    return result;
}
```

- [ ] **Step 5: updateOrderFields verifica fecha**

En `updateOrderFields`, después del UPDATE, si se envió `delivery_date_estimate` agregar:

```typescript
if (patch.delivery_date_estimate !== undefined) {
    await sql`UPDATE orders SET delivery_date_verified_at = NOW() WHERE id = ${id}`;
}
```

- [ ] **Step 6: Verificar types**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add lib/order-actions.ts
git commit -m "refactor(orders): web actions use internal item functions and verify date"
```

---

### Task 4: POST /api/pedidos/[id]/items

**Files:**
- Create: `app/api/pedidos/[id]/items/route.ts`

- [ ] **Step 1: Crear el endpoint**

```typescript
import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { addOrderItemInternal, isApiEditable, readOrder } from "@/lib/orders"

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } },
) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const id = Number.parseInt(params.id, 10)
    if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "Id inválido" }, { status: 400 })
    }

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Body inválido: se esperaba JSON" }, { status: 400 })
    }

    try {
        const order = await readOrder(id)
        if (!order) {
            return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
        }
        if (!isApiEditable(order.status)) {
            return NextResponse.json(
                { error: "El pedido no admite modificaciones en este estado" },
                { status: 409 },
            )
        }

        const result = await addOrderItemInternal(id, {
            product: body.product,
            quantity: Number(body.quantity ?? 1),
            specs: body.specs ?? {},
        })

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }

        await sql`
            UPDATE orders
            SET modified_at = NOW(), delivery_date_verified_at = NULL
            WHERE id = ${id}
        `

        return NextResponse.json({
            item_id: result.itemId,
            product: body.product,
            quantity: body.quantity,
            needs_review: result.needs_review,
            unmapped_specs: result.unmapped,
            sin_alegra: result.sin_alegra,
        }, { status: 201 })
    } catch (error) {
        console.error("Error in POST /api/pedidos/[id]/items:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
```

- [ ] **Step 2: Verificar types**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add app/api/pedidos/[id]/items/route.ts
git commit -m "feat(api): add items to existing order with status check"
```

---

### Task 5: PATCH y DELETE /api/pedidos/[id]/items/[itemId]

**Files:**
- Create: `app/api/pedidos/[id]/items/[itemId]/route.ts`

- [ ] **Step 1: Crear el endpoint**

```typescript
import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { deleteOrderItemInternal, isApiEditable, readOrder, updateOrderItemInternal } from "@/lib/orders"

async function checkOrder(id: number) {
    const order = await readOrder(id)
    if (!order) return { error: "Pedido no encontrado", status: 404 }
    if (!isApiEditable(order.status)) {
        return { error: "El pedido no admite modificaciones en este estado", status: 409 }
    }
    return { order }
}

async function markModified(orderId: number) {
    await sql`
        UPDATE orders
        SET modified_at = NOW(), delivery_date_verified_at = NULL
        WHERE id = ${orderId}
    `
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string; itemId: string } },
) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const orderId = Number.parseInt(params.id, 10)
    const itemId = Number.parseInt(params.itemId, 10)
    if (!Number.isFinite(orderId) || !Number.isFinite(itemId)) {
        return NextResponse.json({ error: "Ids inválidos" }, { status: 400 })
    }

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }

    const check = await checkOrder(orderId)
    if ("error" in check) {
        return NextResponse.json({ error: check.error }, { status: check.status })
    }

    try {
        const result = await updateOrderItemInternal(itemId, {
            quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
            specs: body.specs,
        })
        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }
        await markModified(orderId)
        return NextResponse.json({ ok: true, itemId: result.itemId, warning: result.warning })
    } catch (error) {
        console.error("Error in PATCH /api/pedidos/[id]/items/[itemId]:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string; itemId: string } },
) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    const orderId = Number.parseInt(params.id, 10)
    const itemId = Number.parseInt(params.itemId, 10)
    if (!Number.isFinite(orderId) || !Number.isFinite(itemId)) {
        return NextResponse.json({ error: "Ids inválidos" }, { status: 400 })
    }

    const check = await checkOrder(orderId)
    if ("error" in check) {
        return NextResponse.json({ error: check.error }, { status: check.status })
    }

    try {
        const result = await deleteOrderItemInternal(itemId)
        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }
        await markModified(orderId)
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error("Error in DELETE /api/pedidos/[id]/items/[itemId]:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
```

- [ ] **Step 2: Verificar types**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add app/api/pedidos/[id]/items/[itemId]/route.ts
git commit -m "feat(api): patch and delete order items with status check"
```

---

### Task 6: GET /api/pedidos incluye needs_review

**Files:**
- Modify: `app/api/pedidos/route.ts`

- [ ] **Step 1: Importar orderNeedsReview**

Al inicio del archivo, agregar a los imports de `lib/orders`:

```typescript
import { customerStatus, getCustomerStatusMap, missingMaterials, orderNeedsReview, readOrder } from "@/lib/orders"
```

- [ ] **Step 2: Agregar needs_review a cada pedido**

En el SELECT de orders, agregar:

```typescript
SELECT id, order_number, external_id, status, delivery_date_estimate::text AS delivery_date_estimate,
       modified_at::text AS modified_at, delivery_date_verified_at::text AS delivery_date_verified_at,
       updated_at
FROM orders
```

En el mapeo final de `orders`, agregar:

```typescript
const orders = (rows as any[]).map((r) => ({
    order_id: r.id,
    order_number: r.order_number,
    external_id: r.external_id,
    status: r.status,
    customer_status: customerStatus(r.status, overrides),
    eta: r.delivery_date_estimate,
    updated_at: r.updated_at,
    needs_review: orderNeedsReview({
        modified_at: r.modified_at,
        delivery_date_verified_at: r.delivery_date_verified_at,
    }),
    items: itemsByOrder.get(r.id) ?? [],
}))
```

- [ ] **Step 3: Verificar types**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add app/api/pedidos/route.ts
git commit -m "feat(api): include needs_review in orders list"
```

---

### Task 7: Tablero Kanban muestra badge modificado

**Files:**
- Modify: `app/(pedidos)/pedidos/page.tsx`
- Modify: `components/orders-board.tsx`

- [ ] **Step 1: Agregar campos a la query del tablero**

En `app/(pedidos)/pedidos/page.tsx`, agregar al SELECT:

```typescript
o.modified_at::text AS modified_at,
o.delivery_date_verified_at::text AS delivery_date_verified_at,
```

- [ ] **Step 2: Calcular needs_review en BoardCard**

En el mapeo a `cards`, agregar:

```typescript
modified_at: r.modified_at,
delivery_date_verified_at: r.delivery_date_verified_at,
```

Y actualizar el tipo `BoardCard` en `components/orders-board.tsx`:

```typescript
modified_at: string | null
delivery_date_verified_at: string | null
```

- [ ] **Step 3: Mostrar badge en la tarjeta**

En `components/orders-board.tsx`, importar `orderNeedsReview`:

```typescript
import { orderNeedsReview } from "@/lib/orders"
```

Dentro del render de cada tarjeta, antes del bloque de ítems, agregar:

```typescript
{orderNeedsReview({
    modified_at: card.modified_at,
    delivery_date_verified_at: card.delivery_date_verified_at,
}) && (
    <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        <TriangleAlert className="h-3 w-3" />
        Modificado — revisar fecha
    </div>
)}
```

- [ ] **Step 4: Verificar visualmente**

Run: `npm run dev`
Expected: pedidos modificados por API muestran el badge ámbar.

- [ ] **Step 5: Commit**

```bash
git add app/(pedidos)/pedidos/page.tsx components/orders-board.tsx
git commit -m "feat(board): show modified badge on kanban cards"
```

---

### Task 8: Detalle del pedido con banner y editor bloqueado

**Files:**
- Modify: `app/(pedidos)/pedidos/[id]/page.tsx`
- Modify: `components/order-items-editor.tsx`

- [ ] **Step 1: Pasar props al editor**

En `app/(pedidos)/pedidos/[id]/page.tsx`, dentro del `<section>` de OrderItemsEditor, agregar:

```typescript
<OrderItemsEditor
    orderId={order.id}
    items={order.items.map((i) => ({
        id: i.id,
        product: i.product,
        quantity: i.quantity,
        specs: i.specs,
        needs_review: i.needs_review,
        unmapped_specs: i.unmapped_specs ?? [],
    }))}
    vocab={vocab}
    products={products}
    readOnly={Boolean(order.alegra_invoice_id)}
    readOnlyMessage={order.alegra_invoice_id ? "Pedido facturado: no se pueden editar ítems" : undefined}
    needsReview={orderNeedsReview({
        modified_at: order.modified_at,
        delivery_date_verified_at: order.delivery_date_verified_at,
    })}
/>
```

- [ ] **Step 2: Mostrar banner en el detalle**

Justo antes del `<section>` de ítems, agregar:

```typescript
{orderNeedsReview({
    modified_at: order.modified_at,
    delivery_date_verified_at: order.delivery_date_verified_at,
}) && (
    <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 mb-4">
        Pedido modificado desde el CRM. Revisá la fecha de entrega.
    </div>
)}
```

- [ ] **Step 3: Actualizar OrderItemsEditor para soporte de solo lectura y banner**

En `components/order-items-editor.tsx`, actualizar la interfaz de props:

```typescript
export function OrderItemsEditor({
    orderId,
    items,
    vocab,
    products,
    readOnly = false,
    readOnlyMessage,
    needsReview = false,
}: {
    orderId: number
    items: Item[]
    vocab: Record<string, SpecField>
    products: string[]
    readOnly?: boolean
    readOnlyMessage?: string
    needsReview?: boolean
})
```

Agregar al inicio del render, antes de la tabla:

```typescript
{readOnly && readOnlyMessage && (
    <p className="mb-3 text-sm text-muted-foreground">{readOnlyMessage}</p>
)}
{needsReview && !readOnly && (
    <p className="mb-3 text-sm text-amber-600">Pedido modificado desde el CRM. Revisá la fecha de entrega.</p>
)}
```

Deshabilitar el click para editar fila si `readOnly`:

```typescript
className={`border-t hover:bg-muted/40 cursor-pointer outline-none focus-visible:bg-muted/40 ${
    readOnly ? "cursor-default" : ""
}`}
onClick={() => !readOnly && abrir(item)}
```

Deshabilitar el botón "Agregar producto" si `readOnly`:

```typescript
{!nuevo && !readOnly && (
    <Button ...>Agregar producto</Button>
)}
```

- [ ] **Step 4: Verificar types**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add app/(pedidos)/pedidos/[id]/page.tsx components/order-items-editor.tsx
git commit -m "feat(order-detail): show modified banner and lock items when invoiced"
```

---

### Task 9: Resaltado de ítem nuevo

**Files:**
- Modify: `components/order-items-editor.tsx`
- Modify: `app/(pedidos)/pedidos/[id]/page.tsx`
- Modify: `lib/order-actions.ts` (ya está listo con itemId en return)

- [ ] **Step 1: Agregar highlightedItemId al editor**

Actualizar props:

```typescript
highlightedItemId?: number
```

En el render de cada fila, agregar clase de resaltado:

```typescript
className={`border-t hover:bg-muted/40 cursor-pointer outline-none focus-visible:bg-muted/40 ${
    highlightedItemId === item.id ? "bg-amber-100/60 animate-pulse" : ""
} ${readOnly ? "cursor-default" : ""}`}
```

- [ ] **Step 2: Pasar highlightedItemId desde el detalle**

Leer `searchParams.highlight` en `app/(pedidos)/pedidos/[id]/page.tsx`:

```typescript
export default async function OrderDetailPage({
    params,
    searchParams,
}: {
    params: { id: string }
    searchParams: { highlight?: string }
}) {
    ...
    const highlightedItemId = Number(searchParams.highlight)
    ...
}
```

Y pasarlo a `OrderItemsEditor`:

```typescript
<OrderItemsEditor
    ...
    highlightedItemId={Number.isFinite(highlightedItemId) ? highlightedItemId : undefined}
/>
```

- [ ] **Step 3: Redirigir con highlight al agregar ítem por web**

En `components/order-items-editor.tsx`, reemplazar el handler de agregar:

```typescript
<Button
    size="sm"
    disabled={!nuevo.product || nuevo.quantity <= 0 || addingSave}
    onClick={async () => {
        if (!nuevo) return
        setAddingSave(true)
        const result = await addOrderItem(orderId, nuevo)
        if (result.error) {
            toast.error("No se pudo agregar", { description: result.error })
        } else {
            toast.success(`${nuevo.product} agregado`)
            setNuevo(null)
            if (result.itemId) {
                router.push(`/pedidos/${orderId}?highlight=${result.itemId}`)
            }
            router.refresh()
        }
        setAddingSave(false)
    }}
>
```

- [ ] **Step 4: Verificar visualmente**

Run: `npm run dev`
Expected: al agregar un ítem, la URL cambia a `?highlight=<id>` y la fila se resalta por unos segundos.

- [ ] **Step 5: Commit**

```bash
git add components/order-items-editor.tsx app/(pedidos)/pedidos/[id]/page.tsx
git commit -m "feat(order-detail): highlight newly added item"
```

---

### Task 10: Tests

**Files:**
- Create: `lib/__tests__/order-modifications.test.ts`

- [ ] **Step 1: Test de orderNeedsReview**

```typescript
import { describe, expect, it } from 'vitest'
import { orderNeedsReview } from '@/lib/orders'

describe('orderNeedsReview', () => {
    it('returns false when never modified', () => {
        expect(orderNeedsReview({ modified_at: null, delivery_date_verified_at: null })).toBe(false)
    })

    it('returns true when modified but not verified', () => {
        expect(orderNeedsReview({ modified_at: '2026-08-27T10:00:00Z', delivery_date_verified_at: null })).toBe(true)
    })

    it('returns true when modified after verification', () => {
        expect(orderNeedsReview({
            modified_at: '2026-08-27T12:00:00Z',
            delivery_date_verified_at: '2026-08-27T10:00:00Z',
        })).toBe(true)
    })

    it('returns false when verified after modification', () => {
        expect(orderNeedsReview({
            modified_at: '2026-08-27T10:00:00Z',
            delivery_date_verified_at: '2026-08-27T12:00:00Z',
        })).toBe(false)
    })
})
```

- [ ] **Step 2: Test de isApiEditable**

```typescript
import { isApiEditable } from '@/lib/orders'

describe('isApiEditable', () => {
    it('allows early statuses', () => {
        expect(isApiEditable('por_revisar')).toBe(true)
        expect(isApiEditable('recibido')).toBe(true)
        expect(isApiEditable('en_proceso')).toBe(true)
    })

    it('blocks late statuses', () => {
        expect(isApiEditable('embalado')).toBe(false)
        expect(isApiEditable('facturado')).toBe(false)
        expect(isApiEditable('listo_para_retirar')).toBe(false)
        expect(isApiEditable('retirado')).toBe(false)
        expect(isApiEditable('cancelado')).toBe(false)
    })
})
```

- [ ] **Step 3: Correr tests**

Run: `npm test -- lib/__tests__/order-modifications.test.ts`
Expected: todos pasan.

- [ ] **Step 4: Commit**

```bash
git add lib/__tests__/order-modifications.test.ts
git commit -m "test(orders): add modification tracking tests"
```

---

## Self-review

**Spec coverage:**
- API agrega ítems en estados tempranos: Task 4.
- API modifica/quita ítems en estados tempranos: Task 5.
- Web bloquea ítems si factura emitida: Task 3.
- Seguimiento de modified_at y delivery_date_verified_at: Tasks 2, 6, 3.
- Indicador en tablero: Task 7.
- Banner en detalle: Task 8.
- Resaltado de ítem nuevo: Task 9.
- Tests: Task 10.

**Placeholder scan:**
- Ningún TBD/TODO/fill in details.

**Type consistency:**
- `modified_at` y `delivery_date_verified_at` se usan como `string | null` en todo el plan.
- `orderNeedsReview` recibe el mismo shape siempre.
- Las funciones internas devuelven `{ error?, itemId?, ... }` consistentemente.

**Gaps:** Ninguno identificado.

---

## Execution handoff

Plan completo y guardado en `docs/superpowers/plans/2026-08-27-order-modifications.md`.

**Dos opciones de ejecución:**

1. **Subagent-Driven (recomendado)** — Un subagente por tarea, revisión entre tareas, iteración rápida.
2. **Inline Execution** — Ejecuto las tareas en esta sesión con checkpoints para revisión.

¿Cuál preferís?