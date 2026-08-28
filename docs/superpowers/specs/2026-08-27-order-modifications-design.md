# Diseño: modificación de pedidos por API y seguimiento de revisión

## Contexto

Los pedidos entran principalmente por API desde el bot/CRM. Una vez creados, el cliente o el bot pueden querer agregar o modificar ítems mientras el pedido todavía está en estados tempranos. Cuando eso pasa, el taller necesita saber que el pedido cambió y volver a verificar la fecha de entrega.

Hoy la web del taller ya permite editar ítems, pero no hay control de estado ni seguimiento de que un pedido fue modificado desde fuera.

## Objetivo

Permitir que el bot/CRM modifique ítems de un pedido existente solo en estados tempranos, marcar el pedido como modificado para que el taller revise la fecha de entrega, y mostrar ese estado en el tablero Kanban.

## Reglas de negocio

### 1. Edición de ítems por API

La API solo permite agregar, modificar o quitar ítems si el pedido está en uno de estos estados:

- `por_revisar`
- `recibido`
- `en_proceso`

Si el pedido está en `embalado`, `facturado`, `listo_para_retirar`, `retirado` o `cancelado`, la API devuelve error.

### 2. Edición de ítems por web

La web del taller puede editar ítems sin restricción de estado, **excepto** cuando ya se emitió la factura en Alegra (`alegra_invoice_id IS NOT NULL`). En ese caso los ítems quedan bloqueados: no se agregan, modifican ni quitan.

### 3. Seguimiento de modificaciones

Solo los cambios de ítems que vienen por API marcan al pedido como modificado. Los cambios manuales desde la web no activan el seguimiento.

La fecha de entrega no se cambia por API; siempre se actualiza a mano desde la web.

### 4. Indicador en el tablero

El tablero Kanban muestra un indicador en la tarjeta del pedido mientras haya una modificación por API que todavía no fue revisada.

El pedido se considera revisado cuando un operador confirma la fecha de entrega en la web.

### 5. Resaltado de ítem nuevo

Cuando se agrega un ítem (manual o por API), la fila del ítem se resalta por unos segundos en el detalle del pedido para que el operador lo ubique fácilmente.

## Modelo de datos

Se agregan dos columnas a la tabla `orders`:

| Columna | Tipo | Uso |
|---|---|---|
| `modified_at` | `TIMESTAMP WITH TIME ZONE` | Última vez que un cambio de ítems llegó por API. |
| `delivery_date_verified_at` | `TIMESTAMP WITH TIME ZONE` | Última vez que un operador confirmó la fecha de entrega en la web. |

Ambas son nullable y arrancan en NULL.

### Lógica del indicador

```
needs_review = modified_at IS NOT NULL
               AND (delivery_date_verified_at IS NULL
                    OR modified_at > delivery_date_verified_at)
```

## Endpoints API

### `POST /api/pedidos/{id}/items`

Agrega un ítem a un pedido existente.

**Restricciones:**
- Autenticación server-to-server (`requireInternalSecret`).
- El pedido debe existir.
- El pedido debe estar en `por_revisar`, `recibido` o `en_proceso`.

**Body:**

```json
{
  "product": "Panel LED 60x60",
  "quantity": 2,
  "specs": { "led_color": "blanco", "optic": "25" }
}
```

**Acciones:**
1. Resolver el producto (igual que al crear un pedido).
2. Insertar la línea en `order_items`.
3. Explotar el BOM si corresponde.
4. Actualizar `orders.modified_at = NOW()`.
5. Limpiar `orders.delivery_date_verified_at = NULL`.

**Respuesta:**

```json
{
  "item_id": 456,
  "product": "Panel LED 60x60",
  "quantity": 2,
  "needs_review": false,
  "unmapped_specs": [],
  "sin_alegra": false
}
```

### `PATCH /api/pedidos/{id}/items/{itemId}`

Modifica cantidad o specs de un ítem existente.

**Restricciones:**
- Autenticación server-to-server.
- El pedido debe existir.
- El pedido debe estar en `por_revisar`, `recibido` o `en_proceso`.

**Body:**

```json
{
  "quantity": 3,
  "specs": { "led_color": "calido" }
}
```

**Acciones:**
1. Validar specs.
2. Actualizar `order_items`.
3. Reescalar o re-explotar el BOM según corresponda (misma lógica que `updateOrderItem`).
4. Actualizar `orders.modified_at = NOW()`.
5. Limpiar `orders.delivery_date_verified_at = NULL`.

### `DELETE /api/pedidos/{id}/items/{itemId}`

Quita un ítem del pedido.

**Restricciones:**
- Autenticación server-to-server.
- El pedido debe existir.
- El pedido debe estar en `por_revisar`, `recibido` o `en_proceso`.
- El pedido no puede quedar sin líneas.

**Acciones:**
1. Borrar la línea y sus materiales (CASCADE).
2. Actualizar `orders.modified_at = NOW()`.
3. Limpiar `orders.delivery_date_verified_at = NULL`.

## Cambios en la web

### Detalle del pedido

- `OrderItemsEditor` recibe una prop opcional `highlightedItemId` para resaltar la fila de un ítem recién agregado.
- Al guardar la fecha de entrega, `DateField` actualiza `delivery_date_verified_at = NOW()` además de `delivery_date_estimate`.
- Cuando `needs_review` es true, se muestra un banner en el detalle: "Pedido modificado desde el CRM. Revisá la fecha de entrega."

### Tablero Kanban

- La tarjeta del pedido muestra un badge ámbar "modificado" si `needs_review` es true.
- El badge aparece junto al estado o la prioridad.

### Server actions

- `addOrderItem`, `updateOrderItem`, `deleteOrderItem` (web): no tocan `modified_at` ni `delivery_date_verified_at`.
- `updateOrderFields` (web): cuando se actualiza `delivery_date_estimate`, también guarda `delivery_date_verified_at = NOW()`.

## Nuevos endpoints en archivos

- `app/api/pedidos/[id]/items/route.ts` — POST
- `app/api/pedidos/[id]/items/[itemId]/route.ts` — PATCH y DELETE

## Migración de base de datos

```sql
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS delivery_date_verified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_orders_modified ON orders(modified_at);
```

## Respuesta del GET /api/pedidos

El endpoint ya incluye ítems. Se agrega `needs_review` a cada pedido para que el bot también sepa si el taller todavía no revisó la fecha:

```json
{
  "count": 1,
  "orders": [
    {
      "order_id": 123,
      "order_number": "PED-0001",
      "status": "en_proceso",
      "customer_status": "En fabricación",
      "eta": "2026-09-05",
      "needs_review": true,
      "items": [...]
    }
  ]
}
```

## Flujo de ejemplo

1. Cliente pide por WhatsApp: "Agreguen 2 paneles más".
2. El bot llama `POST /api/pedidos/123/items` con `{ product: "Panel LED", quantity: 2 }`.
3. El pedido 123 está en `en_proceso`, así que la operación se permite.
4. Se agrega el ítem y `orders.modified_at` queda con la hora actual.
5. En el tablero Kanban aparece "modificado" en la tarjeta del pedido 123.
6. Un operador entra al pedido, ve el banner y la fila resaltada del ítem nuevo.
7. Revisa la fecha de entrega y la confirma.
8. `delivery_date_verified_at` se actualiza y el indicador desaparece.

## Límites y decisiones explícitas

- No se implementa historial de modificaciones (audit log). Solo se guarda la última fecha de modificación por API.
- No se permite cambiar la fecha de entrega por API; siempre es manual.
- La web bloquea ítems solo si la factura fue emitida, no por estado.
- El indicador "modificado" solo reacciona a cambios por API; cambios manuales no lo prenden.