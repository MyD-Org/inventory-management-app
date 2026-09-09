# Pedidos para stock — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pedidos de producción propia: sin cliente, sin factura/remito, terminan en un estado "En depósito" fuera del tablero que solo se elige desde el detalle, y un filtro en la vista lista para ver lo fabricado.

**Architecture:** flag `for_stock` en `orders` + estado `en_deposito` en `lib/order-statuses.ts` fuera de `BOARD_STATUSES` (mismo patrón que `cancelado`). El alta web marca el flag con un switch y el server fija el cliente al valor sentinela `'stock'`. Guardas en `updateOrderStatus` en ambas direcciones. Spec: `docs/superpowers/specs/2026-09-09-pedidos-para-stock-design.md`.

**Tech Stack:** Next.js 14 App Router, Postgres (Neon) vía `@neondatabase/serverless`, vitest, shadcn/ui (Switch ya existe en `components/ui/switch.tsx`).

**Convenciones del repo:** tests con `npm test` (vitest, NO jest); typecheck `npx tsc --noEmit`; migraciones con `node scripts/run-sql.js <archivo.sql>` (lee `.env.local`); commits en inglés o español cortos como el historial reciente.

**Preparación (una sola vez, antes del Task 1):**

```bash
git checkout -b feat/pedidos-para-stock
```

---

### Task 1: Migración + estado `en_deposito` en order-statuses

**Files:**
- Create: `scripts/39-pedidos-para-stock.sql`
- Modify: `lib/order-statuses.ts`
- Modify: `lib/__tests__/order-statuses.test.ts`
- Modify: `components/order-glyphs.tsx`

- [ ] **Step 1: Crear y aplicar la migración local**

`scripts/39-pedidos-para-stock.sql`:

```sql
-- Pedidos para stock: producción propia sin cliente. El alta web marca
-- for_stock y el pedido termina en "en_deposito" (fuera del tablero).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS for_stock BOOLEAN NOT NULL DEFAULT FALSE;
```

Run: `node scripts/run-sql.js scripts/39-pedidos-para-stock.sql`
Expected: sale sin error (el script imprime resultado por sentencia).

Verificar que la columna quedó:

```bash
set -a; source .env.local; set +a
node -e "const {neon}=require('@neondatabase/serverless');neon(process.env.DATABASE_URL)\`SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='for_stock'\`.then(r=>console.log(r))"
```

Expected: `[ { column_name: 'for_stock' } ]`

- [ ] **Step 2: Escribir el test que falla**

En `lib/__tests__/order-statuses.test.ts`, reemplazar el primer test y agregar dos al final del `describe` (los imports ya traen `ORDER_STATUSES`, `BOARD_STATUSES`, `STATUS_LABELS`; agregar `orderCustomerLabel` al import de `@/lib/order-statuses`):

```ts
it("el tablero muestra todos los estados menos cancelado y en_deposito", () => {
    expect(BOARD_STATUSES).not.toContain("cancelado")
    expect(BOARD_STATUSES).not.toContain("en_deposito")
    expect(BOARD_STATUSES).toHaveLength(ORDER_STATUSES.length - 2)
})
```

```ts
it("en_deposito tiene etiqueta para el taller y para el cliente", () => {
    expect(STATUS_LABELS.en_deposito).toBe("En depósito")
})

it("los pedidos para stock se nombran Producción propia", () => {
    expect(
        orderCustomerLabel({ for_stock: true, customer_name: null, customer_external_id: "stock" }),
    ).toBe("Producción propia")
    expect(
        orderCustomerLabel({ for_stock: false, customer_name: "Juan", customer_external_id: "alegra:1" }),
    ).toBe("Juan")
    expect(
        orderCustomerLabel({ for_stock: false, customer_name: null, customer_external_id: "manual:juan" }),
    ).toBe("manual:juan")
})
```

- [ ] **Step 3: Correr el test y ver que falla**

Run: `npx vitest run lib/__tests__/order-statuses.test.ts`
Expected: FAIL — `en_deposito` no existe en `ORDER_STATUSES` (longitud 7 vs 8) y `orderCustomerLabel` no está exportado.

- [ ] **Step 4: Implementar en lib/order-statuses.ts**

En `ORDER_STATUSES` agregar `"en_deposito"` DESPUÉS de `"retirado"` (antes de `"cancelado"`):

```ts
export const ORDER_STATUSES = [
    "por_revisar",
    "recibido",
    "en_proceso",
    "por_facturar",
    "listo_para_retirar",
    "retirado",
    "en_deposito",
    "cancelado",
] as const
```

Reemplazar el filtro de `BOARD_STATUSES`:

```ts
// 'cancelado' y 'en_deposito' quedan fuera del flujo visible del kanban: el
// primero es un cementerio y el segundo es el final de la producción propia,
// que se elige solo desde el detalle del pedido.
export const BOARD_STATUSES = ORDER_STATUSES.filter((s) => s !== "cancelado" && s !== "en_deposito")
```

En `STATUS_LABELS` agregar (después de `retirado`):

```ts
    en_deposito: "En depósito",
```

En `DEFAULT_CUSTOMER_STATUS` agregar (después de `retirado`):

```ts
    en_deposito: "En depósito",
```

Agregar al final del archivo la función:

```ts
// Cómo se nombra al "cliente" de un pedido en tablero, lista y detalle. Los
// pedidos para stock no tienen cliente: se leen como producción propia.
export function orderCustomerLabel(order: {
    for_stock: boolean
    customer_name: string | null
    customer_external_id: string
}): string {
    return order.for_stock ? "Producción propia" : (order.customer_name ?? order.customer_external_id)
}
```

- [ ] **Step 5: Agregar el glifo en components/order-glyphs.tsx**

`STATUS_STYLE` es `Record<OrderStatus, ...>`: TypeScript exige la clave nueva. Agregar después de `retirado`:

```ts
    en_deposito: { progress: 1, className: "text-sky-600" },
```

(`progress: 1` pinta el tilde de completo; sky en vez de esmeralda para distinguirlo de "entregado" en la tabla.)

- [ ] **Step 6: Verificar**

Run: `npx vitest run lib/__tests__/order-statuses.test.ts && npx tsc --noEmit`
Expected: tests PASS (9 tests del archivo: 7 originales con el primero reescrito, +2 nuevos) y tsc limpio.

- [ ] **Step 7: Commit**

```bash
git add scripts/39-pedidos-para-stock.sql lib/order-statuses.ts lib/__tests__/order-statuses.test.ts components/order-glyphs.tsx
git commit -m "feat(pedidos): estado en_deposito y etiqueta Producción propia"
```

---

### Task 2: Payload `for_stock` + validación + createOrder

**Files:**
- Modify: `lib/order-validation.ts`
- Modify: `lib/__tests__/order-validation.test.ts`
- Modify: `lib/orders.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `lib/__tests__/order-validation.test.ts`, dentro del `describe("validateOrderPayloadWith", ...)`:

```ts
it("un pedido para stock no necesita cliente", () => {
    const errores = validateOrderPayloadWith(
        {
            external_id: "MAN-20260909-abc12",
            for_stock: true,
            customer: { external_id: "" },
            items: [{ product: "Optic 1", quantity: 2 }],
        },
        vocab,
    )
    expect(errores).toEqual([])
})

it("un pedido normal sin cliente sigue fallando", () => {
    const errores = validateOrderPayloadWith(
        {
            external_id: "MAN-20260909-abc12",
            customer: { external_id: "" },
            items: [{ product: "Optic 1", quantity: 2 }],
        },
        vocab,
    )
    expect(errores.some((e) => e.includes("customer.external_id"))).toBe(true)
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/__tests__/order-validation.test.ts`
Expected: FAIL en "un pedido para stock no necesita cliente" — la validación exige `customer.external_id` siempre.

- [ ] **Step 3: Implementar la validación**

En `lib/order-validation.ts`, en la interfaz `OrderPayload` agregar después de `origin?: string`:

```ts
    /** Producción propia: sin cliente, termina en "en_deposito". */
    for_stock?: boolean
```

En `validateOrderPayloadWith`, reemplazar la línea del cliente:

```ts
    if (!payload.for_stock && !payload.customer?.external_id?.trim()) errors.push("Falta customer.external_id")
```

- [ ] **Step 4: Persistir el flag en lib/orders.ts**

En la interfaz `Order` (cerca de la línea 278, junto a `origin`) agregar:

```ts
    for_stock: boolean
```

En `readOrder`, agregar `for_stock` al SELECT (la línea empieza `SELECT id, order_number, external_id, origin, ...`):

```ts
        SELECT id, order_number, external_id, origin, for_stock, customer_external_id, customer_name,
```

El return hace `...(order as any)` así que el campo fluye solo.

En `createOrder`, en el INSERT de `orders` (cerca de la línea 613), agregar la columna y el valor:

```ts
        INSERT INTO orders (
            external_id, origin, for_stock, customer_external_id, customer_name, customer_phone,
            status, priority, delivery_date_estimate, source_conversation, reference, notes
        )
        VALUES (
            ${externalId},
            ${origin},
            ${Boolean(payload.for_stock)},
            ${payload.customer.external_id.trim()},
```

- [ ] **Step 5: Verificar**

Run: `npx vitest run lib/__tests__/order-validation.test.ts && npx tsc --noEmit`
Expected: tests PASS y tsc limpio.

- [ ] **Step 6: Commit**

```bash
git add lib/order-validation.ts lib/__tests__/order-validation.test.ts lib/orders.ts
git commit -m "feat(pedidos): flag for_stock en payload, validación y alta"
```

---

### Task 3: createOrderManual fija el cliente + guardas en updateOrderStatus

**Files:**
- Modify: `lib/order-actions.ts`

- [ ] **Step 1: createOrderManual — fijar el cliente sentinela**

En `createOrderManual` (cerca de la línea 47, después del bloque que genera el `manual:` external id), agregar:

```ts
    // Pedido para stock: producción propia sin cliente. El cliente queda en el
    // valor fijo 'stock' (mismo estilo que los 'manual:xxx'); la UI lo lee como
    // "Producción propia" gracias a la columna for_stock.
    if (payload.for_stock) {
        payload = {
            ...payload,
            customer: { external_id: 'stock', name: null, phone: null },
        };
    }
```

- [ ] **Step 2: updateOrderStatus — guardas en ambas direcciones**

En `updateOrderStatus` (cerca de la línea 85), reemplazar el chequeo de `listo_para_retirar` por este bloque (un solo SELECT sirve para las dos guardas y el chequeo de factura existente):

```ts
        const [row] = await sql`SELECT for_stock, alegra_invoice_id FROM orders WHERE id = ${id}`;
        const forStock = Boolean(row?.for_stock);

        // La producción propia no se factura ni se remite: esos estados no
        // existen para ella. Y "en_deposito" es exclusivo de los pedidos para
        // stock: un pedido de cliente termina en retirado, con su factura.
        if (forStock && (status === 'por_facturar' || status === 'listo_para_retirar')) {
            return { error: 'El pedido es de producción propia: no se factura ni se remite' };
        }
        if (status === 'en_deposito' && !forStock) {
            return { error: 'Solo los pedidos para stock pueden pasar a "En depósito"' };
        }

        // No se puede pasar a listo para retirar sin haber facturado: la factura
        // es el paso previo obligatorio en el flujo.
        if (status === 'listo_para_retirar' && !row?.alegra_invoice_id) {
            return { error: 'Falta emitir la factura antes de pasar a listo para retirar' };
        }
```

(Borra el SELECT viejo de `alegra_invoice_id` que había dentro del chequeo de `listo_para_retirar`; ahora viene de `row`.)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: limpio. (No hay tests de `order-actions` — habla con la base; se verifica manual en Task 7.)

- [ ] **Step 4: Commit**

```bash
git add lib/order-actions.ts
git commit -m "feat(pedidos): alta para stock sin cliente y guardas de estado"
```

---

### Task 4: Switch "Producción para stock" en el alta

**Files:**
- Modify: `components/new-order-page.tsx`

- [ ] **Step 1: Agregar estado y payload**

En `NewOrderPage`, junto a los otros `useState` (cerca de la línea 120):

```tsx
    const [paraStock, setParaStock] = useState(false)
```

En `crear()`, reemplazar el chequeo y el payload (cerca de las líneas 188-211):

```tsx
        if (!paraStock && !customer) {
            toast.error("Falta el cliente", { description: "Elegí para quién es el pedido." })
            return
        }
        if (lines.length === 0) {
            toast.error("Falta el producto", { description: "Agregá al menos un producto al pedido." })
            return
        }

        setSaving(true)
        const result = await createOrderManual({
            external_id: "",
            origin: "manual",
            for_stock: paraStock,
            customer: paraStock
                ? { external_id: "", name: null, phone: null }
                : {
                      external_id: customer!.external_id,
                      name: customer!.name,
                      phone: customer!.phone,
                  },
            items: lines,
            delivery_date_estimate: eta || null,
            priority,
            reference: reference || null,
            notes: notes || null,
        })
```

- [ ] **Step 2: Agregar el switch en la columna de propiedades**

En el `aside` (cerca de la línea 516), reemplazar `<CustomerPicker ... />` por:

```tsx
                    <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                        <Label htmlFor="para-stock" className="text-base cursor-pointer">
                            Producción para stock
                        </Label>
                        <Switch
                            id="para-stock"
                            checked={paraStock}
                            onCheckedChange={setParaStock}
                        />
                    </div>

                    {!paraStock && <CustomerPicker value={customer} onChange={setCustomer} />}
```

Y agregar los imports junto a los de `@/components/ui/*` (cerca de la línea 21):

```tsx
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 4: Commit**

```bash
git add components/new-order-page.tsx
git commit -m "feat(pedidos): interruptor de producción para stock en el alta"
```

---

### Task 5: Tablero, lista y filtro "En depósito"

**Files:**
- Modify: `app/(pedidos)/pedidos/page.tsx`
- Modify: `components/orders-board.tsx`
- Modify: `components/orders-table.tsx`
- Modify: `components/orders-view.tsx`

- [ ] **Step 1: Traer for_stock en la query de la página**

En `app/(pedidos)/pedidos/page.tsx`, agregar `o.for_stock` al SELECT (cerca de la línea 24) y al mapeo a `BoardCard` (cerca de la línea 52):

```ts
        SELECT o.id, o.order_number, o.external_id, o.customer_name, o.customer_external_id,
               o.for_stock, o.status, o.priority, o.origin, o.source_conversation,
```

```ts
        customer_name: r.customer_name,
        customer_external_id: r.customer_external_id,
        for_stock: r.for_stock,
```

- [ ] **Step 2: BoardCard + tarjeta + isOverdue en orders-board.tsx**

En la interfaz `BoardCard` (cerca de la línea 20) agregar:

```ts
    for_stock: boolean
```

En `isOverdue` (cerca de la línea 58), agregar `en_deposito` a los excluidos:

```ts
    if (!d || status === "retirado" || status === "cancelado" || status === "en_deposito") return false
```

En el título de la tarjeta (cerca de la línea 286), reemplazar:

```tsx
                                            <div className="font-display text-[1.05rem] font-semibold leading-tight truncate">
                                                {orderCustomerLabel(card)}
                                            </div>
```

Y agregar el import junto a los de `@/lib/order-statuses` (línea 13):

```ts
import { BOARD_STATUSES, orderCustomerLabel, orderNeedsReview, STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"
```

- [ ] **Step 3: Fila de la tabla en orders-table.tsx**

Reemplazar el título de la fila (cerca de la línea 78):

```tsx
                                    {orderCustomerLabel(o)}
```

Import (línea 15):

```ts
import { orderCustomerLabel, STATUS_LABELS } from "@/lib/order-statuses"
```

- [ ] **Step 4: Filtro "En depósito" en orders-view.tsx**

Cambios de a poco:

a) Tipo de filtro (línea 19):

```ts
type Filter = "vencidos" | "alta" | "sin_materiales" | "en_deposito" | null
```

b) `isDueWithinAWeek` (línea 24): agregar `en_deposito` a los estados que no cuentan:

```ts
    if (!d || status === "retirado" || status === "cancelado" || status === "en_deposito") return false
```

c) Filtro de visibles (dentro de `visible.filter`, cerca de la línea 88), agregar:

```ts
        if (filter === "en_deposito" && c.status !== "en_deposito") return false
```

d) `boardCards` (línea 97): los de depósito tampoco viven en el tablero, ni buscando:

```ts
    const boardCards = q
        ? visible.filter((c) => c.status !== "en_deposito")
        : visible.filter((c) => c.status !== "cancelado" && c.status !== "en_deposito")
```

e) El chip del filtro, junto al de "Prioridad alta" (cerca de la línea 138), solo en vista lista:

```tsx
                {lista && (
                    <Chip
                        active={filter === "en_deposito"}
                        onClick={() => setFilter((f) => (f === "en_deposito" ? null : "en_deposito"))}
                    >
                        En depósito
                    </Chip>
                )}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -4`
Expected: tsc limpio y los 106 tests en verde (102 base + 2 de Task 1 + 2 de Task 2).

- [ ] **Step 6: Commit**

```bash
git add "app/(pedidos)/pedidos/page.tsx" components/orders-board.tsx components/orders-table.tsx components/orders-view.tsx
git commit -m "feat(pedidos): filtro En depósito y Producción propia en tarjetas"
```

---

### Task 6: Detalle del pedido

**Files:**
- Modify: `app/(pedidos)/pedidos/[id]/page.tsx`
- Modify: `components/order-status-select.tsx`

- [ ] **Step 1: Selector de estado filtrado en order-status-select.tsx**

Agregar la prop (cerca de la línea 16):

```tsx
export function OrderStatusSelect({
    id,
    status,
    hasInvoice = false,
    hasRemission = false,
    forStock = false,
}: {
    id: number
    status: OrderStatus
    /** Qué documentos YA existen: define qué va a emitirse al pasar a facturar. */
    hasInvoice?: boolean
    hasRemission?: boolean
    /** Producción propia: no se factura; su final es "En depósito". */
    forStock?: boolean
}) {
```

Reemplazar el mapeo de opciones (cerca de la línea 82):

```tsx
                {ORDER_STATUSES.filter((s) =>
                    forStock
                        ? s !== "por_facturar" && s !== "listo_para_retirar"
                        : s !== "en_deposito",
                ).map((s) => (
```

- [ ] **Step 2: Pasar el flag y ajustar la página del detalle**

En `app/(pedidos)/pedidos/[id]/page.tsx`:

a) Pasar la prop (cerca de la línea 219):

```tsx
                        <OrderStatusSelect
                            id={order.id}
                            status={order.status}
                            hasInvoice={Boolean(order.alegra_invoice_id)}
                            hasRemission={Boolean(order.alegra_remission_id)}
                            forStock={order.for_stock}
                        />
```

b) Título en pantalla (línea 193) y encabezado impreso (línea 172): reemplazar `order.customer_name ?? order.customer_external_id` por `orderCustomerLabel(order)` en ambos. Import (junto a los de `@/lib/order-statuses`, líneas 7-8):

```ts
import { orderCustomerLabel, orderNeedsReview, STATUS_LABELS } from "@/lib/order-statuses"
```

(Dejar el import viejo de `orderNeedsReview` si se usa aparte — fusionar en un solo import de `@/lib/order-statuses`.)

c) `overdue` (línea 156): agregar `en_deposito`:

```ts
        if (!d || order.status === "retirado" || order.status === "cancelado" || order.status === "en_deposito") return false
```

d) Ocultar las celdas de Factura y Remito en los pedidos para stock (no se emiten; los botones invitarían a un error de Alegra). Envolver cada celda completa — la de Factura va de la línea 255 (`<Fact label="Factura">`) a la 311 (`</Fact>`) y la de Remito de la 314 a la 354, ambas adentro del `<OrderEmissionProvider>`:

```tsx
                    {!order.for_stock && (
                    <Fact label="Factura">
                        {/* ...todo el contenido existente, sin cambios... */}
                    </Fact>
                    )}
```

```tsx
                    {!order.for_stock && (
                    <Fact label="Remito">
                        {/* ...todo el contenido existente, sin cambios... */}
                    </Fact>
                    )}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -4`
Expected: tsc limpio, tests en verde.

- [ ] **Step 4: Commit**

```bash
git add "app/(pedidos)/pedidos/[id]/page.tsx" components/order-status-select.tsx
git commit -m "feat(pedidos): en_deposito solo desde el detalle y sin factura en stock"
```

---

### Task 7: QA manual, migración de producción y PR

**Files:** ninguno nuevo (verificación y deploy).

- [ ] **Step 1: QA manual en local** (el dev server corre en http://localhost:3006; si no responde, `npm run dev`)

1. Entrar como admin → Pedidos → "Nuevo pedido".
2. Activar "Producción para stock": el campo Cliente desaparece.
3. Agregar un producto, crear. Expected: llega al detalle con título "Producción propia", sin celdas de Factura ni Remito.
4. En el tablero, la tarjeta se ve como "Producción propia" y se mueve de columna normalmente.
5. En el detalle, el selector de estado ofrece "En depósito" y NO ofrece "Preparando entrega" ni "Listo para retirar".
6. Pasar a "En depósito": toast de confirmación y el pedido desaparece del tablero.
7. Vista lista → chip "En depósito": el pedido está. Quitar el filtro: no aparece en el tablero ni en la lista general (sí al buscarlo en la lista).
8. Con un pedido normal: el selector NO ofrece "En depósito"; al intentar pasar un pedido para stock a "Preparando entrega" por la API de acciones no se puede desde la UI (el server lo rechaza con el error de la guarda).

- [ ] **Step 2: Aplicar la migración a producción ANTES de mergear**

El código nuevo escribe `for_stock`; si deploya antes que la columna exista, rompe. El ALTER es compatible con el código viejo, así que va primero:

```bash
vercel env pull /tmp/env-prod --environment=production --yes
set -a; source /tmp/env-prod; set +a
node -e "const {neon}=require('@neondatabase/serverless');const s=neon(process.env.DATABASE_URL);s\`ALTER TABLE orders ADD COLUMN IF NOT EXISTS for_stock BOOLEAN NOT NULL DEFAULT FALSE\`.then(()=>console.log('columna for_stock creada')).catch(e=>{console.error(e.message);process.exit(1)})"
rm /tmp/env-prod   # tiene secrets: no dejarlo dando vueltas
```

Expected: `columna for_stock creada`.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/pedidos-para-stock
gh pr create --title "feat(pedidos): producción para stock sin cliente ni factura" --body "..."
```

El PR linkea el spec (`docs/superpowers/specs/2026-09-09-pedidos-para-stock-design.md`) y describe: switch en el alta, estado en_deposito fuera del tablero, filtro en la vista lista, guardas server-side. Recordar en el cuerpo que la migración de producción ya está aplicada (Task 7 Step 2).

- [ ] **Step 4: Merge**

Esperar a que el usuario mergee. Después: `git checkout main && git pull && git branch -d feat/pedidos-para-stock`, y verificar `npm test` en main.

---

## Self-review del plan contra el spec

- **Switch en el alta que esconde el cliente** → Task 4 ✔
- **Sin cliente persistido** (`'stock'` + `for_stock`) → Tasks 1, 2, 3 ✔
- **Estado "En depósito" solo desde el detalle, sin columna** → Tasks 1 (BOARD_STATUSES), 6 (selector filtrado) ✔
- **Desaparece del tablero, queda el registro** → Task 5 (boardCards) ✔
- **Filtro en la vista lista** → Task 5 ✔
- **Guardas server (ambas direcciones)** → Task 3 ✔
- **Nada de Alegra** → Task 6 oculta emisión en pedidos para stock ✔
- **Consumo de materiales sin cambios** → no requiere tarea (flujo existente) ✔
- **Tests de validación y estados** → Tasks 1 y 2 ✔
