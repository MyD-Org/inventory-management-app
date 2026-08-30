# Pedido "Por facturar" con facturación automática — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar los estados `embalado` y `facturado` en `por_facturar`, y emitir automáticamente el borrador de factura en Alegra al entrar a ese estado.

**Architecture:** Se reemplazan los estados internos en `lib/order-statuses.ts` y sus representaciones visuales. La server action `updateOrderStatus` importa `invoiceOrder` y la invoca cuando el destino es `por_facturar`. La UI solo cambia las condiciones donde antes se mencionaba `facturado`. Una migración SQL convierte pedidos históricos y actualiza el constraint.

**Tech Stack:** Next.js 14, TypeScript, Tailwind, PostgreSQL (Neon), Vitest.

---

## Files that change

| File | Responsibility |
|---|---|
| `lib/order-statuses.ts` | Fuente única de estados, etiquetas y customer status defaults. |
| `components/order-glyphs.tsx` | Glifo/progreso visual de cada estado. |
| `lib/order-actions.ts` | `updateOrderStatus`: cambia estado y dispara facturación automática. |
| `components/order-status-select.tsx` | Muestra toast de warning si la factura automática falló. |
| `components/orders-board.tsx` | Muestra toast de warning y badge "Falta factura" en la nueva columna. |
| `app/(pedidos)/pedidos/[id]/page.tsx` | Muestra el botón manual cuando el pedido está en `por_facturar`. |
| `scripts/18-por-facturar.sql` | Migración de estados y mapa al cliente. |
| `lib/__tests__/order-statuses.test.ts` | Tests de estados. |
| `lib/__tests__/order-modifications.test.ts` | Tests de edición por estado. |

---

### Task 1: Reemplazar estados `embalado`/`facturado` por `por_facturar`

**Files:**
- Modify: `lib/order-statuses.ts`

- [ ] **Step 1: Editar `ORDER_STATUSES`**

```ts
export const ORDER_STATUSES = [
    "por_revisar",
    "recibido",
    "en_proceso",
    "por_facturar",
    "listo_para_retirar",
    "retirado",
    "cancelado",
] as const
```

- [ ] **Step 2: Editar `STATUS_LABELS`**

```ts
export const STATUS_LABELS: Record<OrderStatus, string> = {
    por_revisar: "Por revisar",
    recibido: "Recibido",
    en_proceso: "En proceso",
    por_facturar: "Por facturar",
    listo_para_retirar: "Listo para retirar",
    retirado: "Retirado",
    cancelado: "Cancelado",
}
```

- [ ] **Step 3: Editar `DEFAULT_CUSTOMER_STATUS`**

```ts
export const DEFAULT_CUSTOMER_STATUS: Record<OrderStatus, string> = {
    por_revisar: "Recibido",
    recibido: "Recibido",
    en_proceso: "En fabricación",
    por_facturar: "En preparación",
    listo_para_retirar: "Listo para retirar",
    retirado: "Entregado",
    cancelado: "Cancelado",
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/order-statuses.ts
git commit -m "feat(pedidos): reemplaza embalado/facturado por por_facturar"
```

---

### Task 2: Actualizar glifo de estado

**Files:**
- Modify: `components/order-glyphs.tsx`

- [ ] **Step 1: Reemplazar `STATUS_STYLE`**

```ts
const STATUS_STYLE: Record<OrderStatus, { progress: number; className: string }> = {
    por_revisar: { progress: 0, className: "text-muted-foreground" },
    recibido: { progress: 0, className: "text-sky-500" },
    en_proceso: { progress: 0.35, className: "text-amber-500" },
    por_facturar: { progress: 0.7, className: "text-violet-500" },
    listo_para_retirar: { progress: 1, className: "text-emerald-500" },
    retirado: { progress: 1, className: "text-emerald-600" },
    cancelado: { progress: 0, className: "text-muted-foreground" },
}
```

- [ ] **Step 2: Commit**

```bash
git add components/order-glyphs.tsx
git commit -m "feat(pedidos): glifo para estado por_facturar"
```

---

### Task 3: Facturación automática en `updateOrderStatus`

**Files:**
- Modify: `lib/order-actions.ts`

- [ ] **Step 1: Importar `invoiceOrder`**

Agregar al inicio del archivo, junto a los otros imports de `lib/`:

```ts
import { invoiceOrder } from '@/lib/invoicing';
```

- [ ] **Step 2: Reemplazar `updateOrderStatus`**

```ts
export async function updateOrderStatus(id: number, status: string) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };
    if (!ORDER_STATUSES.includes(status as any)) return { error: 'Estado inválido' };

    try {
        if (status === 'listo_para_retirar') {
            const [order] = await sql`SELECT alegra_invoice_id FROM orders WHERE id = ${id}`;
            if (!order?.alegra_invoice_id) {
                return { error: 'Falta emitir la factura antes de pasar a listo_para_retirar' };
            }
        }

        await sql`UPDATE orders SET status = ${status} WHERE id = ${id}`;

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
                    if (result.invoiceId == null) {
                        warning = result.warnings?.[0] ?? 'No se pudo generar la factura automáticamente.';
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
```

- [ ] **Step 3: Commit**

```bash
git add lib/order-actions.ts
git commit -m "feat(pedidos): facturación automática al pasar a por_facturar"
```

---

### Task 4: Mostrar warning en el selector de estado

**Files:**
- Modify: `components/order-status-select.tsx`

- [ ] **Step 1: Cambiar el manejo del resultado de `updateOrderStatus`**

```ts
async function change(next: string) {
    const previous = value;
    setValue(next as OrderStatus);
    setSaving(true);
    const result = await updateOrderStatus(id, next);
    setSaving(false);
    if (result.error) {
        setValue(previous);
        toast.error("No se pudo cambiar el estado", { description: result.error });
        return;
    }
    if (result.warning) {
        toast.warning(`Pasó a ${STATUS_LABELS[next as OrderStatus]}`, { description: result.warning });
    } else {
        toast.success(`Pasó a ${STATUS_LABELS[next as OrderStatus]}`);
    }
    router.refresh();
}
```

- [ ] **Step 2: Commit**

```bash
git add components/order-status-select.tsx
git commit -m "feat(pedidos): avisa si la factura automática falló en el selector"
```

---

### Task 5: Mostrar warning y badge en el tablero

**Files:**
- Modify: `components/orders-board.tsx`

- [ ] **Step 1: Cambiar la condición del badge "Falta factura"**

Buscar:

```tsx
{card.status === "facturado" && !card.alegra_invoice_id && (
```

Reemplazar por:

```tsx
{card.status === "por_facturar" && !card.alegra_invoice_id && (
```

- [ ] **Step 2: Mostrar warning si la factura automática falló**

Buscar la función `move` y reemplazarla por:

```ts
async function move(id: number, status: OrderStatus) {
    if ((cards.find((c) => c.id === id)?.status ?? null) === status) return;

    setMoved((m) => ({ ...m, [id]: status }));
    const result = await updateOrderStatus(id, status);
    if (result.error) {
        setMoved((m) => {
            const next = { ...m };
            delete next[id];
            return next;
        });
        toast.error("No se pudo mover", { description: result.error });
        return;
    }
    if (result.warning) {
        toast.warning(`Pasó a ${STATUS_LABELS[status]}`, { description: result.warning });
    } else {
        toast.success(`Pasó a ${STATUS_LABELS[status]}`);
    }
    router.refresh();
}
```

- [ ] **Step 3: Commit**

```bash
git add components/orders-board.tsx
git commit -m "feat(pedidos): badge y warning por_facturar en tablero"
```

---

### Task 6: Actualizar detalle del pedido

**Files:**
- Modify: `app/(pedidos)/pedidos/[id]/page.tsx`

- [ ] **Step 1: Cambiar condición del botón manual**

Buscar:

```tsx
{order.alegra_invoice_id ? (
```

Dentro del bloque, buscar:

```tsx
) : order.status === "facturado" ? (
```

Reemplazar por:

```tsx
) : order.status === "por_facturar" ? (
```

- [ ] **Step 2: Commit**

```bash
git add app/(pedidos)/pedidos/\[id\]/page.tsx
git commit -m "feat(pedidos): botón manual solo en estado por_facturar"
```

---

### Task 7: Crear migración SQL

**Files:**
- Create: `scripts/18-por-facturar.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- ============================================
-- Unifica embalado y facturado en por_facturar.
--
-- Aplicar en prod: node scripts/run-sql.js scripts/18-por-facturar.sql
-- ============================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('por_revisar', 'recibido', 'en_proceso', 'por_facturar',
                      'listo_para_retirar', 'retirado', 'cancelado'));

UPDATE orders SET status = 'por_facturar' WHERE status IN ('embalado', 'facturado');

INSERT INTO app_settings (key, value) VALUES ('order_customer_status', '{
    "por_revisar": "Recibido",
    "recibido": "Recibido",
    "en_proceso": "En fabricación",
    "por_facturar": "En preparación",
    "listo_para_retirar": "Listo para retirar",
    "retirado": "Entregado",
    "cancelado": "Cancelado"
}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

- [ ] **Step 2: Ejecutar en local**

```bash
node scripts/run-sql.js scripts/18-por-facturar.sql
```

Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add scripts/18-por-facturar.sql
git commit -m "chore(db): migración de embalado/facturado a por_facturar"
```

---

### Task 8: Actualizar tests existentes

**Files:**
- Modify: `lib/__tests__/order-statuses.test.ts`
- Modify: `lib/__tests__/order-modifications.test.ts`

- [ ] **Step 1: Actualizar `order-statuses.test.ts`**

Buscar:

```ts
expect(customerStatus("embalado")).toBe("En preparación")
```

Reemplazar por:

```ts
expect(customerStatus("por_facturar")).toBe("En preparación")
```

- [ ] **Step 2: Actualizar `order-modifications.test.ts`**

Buscar:

```ts
expect(isApiEditable('embalado')).toBe(false)
expect(isApiEditable('facturado')).toBe(false)
```

Reemplazar por:

```ts
expect(isApiEditable('por_facturar')).toBe(false)
```

- [ ] **Step 3: Correr tests**

```bash
npm test
```

Expected: todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add lib/__tests__/order-statuses.test.ts lib/__tests__/order-modifications.test.ts
git commit -m "test(pedidos): actualiza tests para estado por_facturar"
```

---

## Self-review

- [x] Spec coverage: estados, facturación automática, UI, migración y tests están cubiertos.
- [x] Placeholder scan: no hay TBD ni pasos vagos.
- [x] Type consistency: se usa `por_facturar` en todos lados; `invoiceOrder` recibe `terms`/`notes` como `string | undefined`.
