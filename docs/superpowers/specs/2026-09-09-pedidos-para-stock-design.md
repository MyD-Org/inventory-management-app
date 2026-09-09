# Diseño: pedidos para stock (producción propia)

**Fecha:** 2026-09-09
**Estado:** aprobado para implementar (pendiente plan de implementación)

## Contexto

A veces el taller fabrica productos sin un cliente de por medio: producción propia
que va al depósito hasta que se venda. Hoy el sistema no contempla ese caso: todo
pedido exige cliente (la UI valida "Falta el cliente" y el server
`Falta customer.external_id`) y el flujo termina siempre en factura + remito en
Alegra — entrar a "Preparando entrega" dispara la emisión automática de los dos
documentos y "Listo para retirar" está bloqueado sin factura a nivel servidor.

El workaround actual (cliente "Stock" escrito a mano + saltear la facturación
arrastrando directo a "Retirado") funciona pero deja el pedido marcado como
"Retirado" mezclado con los reales, sin un lugar donde ver lo fabricado esperando.

## Alcance

**Sí entra:**

- Alta de pedido marcado "para stock": sin cliente, con el resto del form igual
  (ítems, fecha, prioridad, notas).
- El pedido para stock recorre el tablero normal (por revisar → recibido →
  en proceso) y consume materiales como cualquier otro.
- Estado final propio "En depósito", elegible **solo desde la vista del pedido**
  (no desde el tablero, donde no tiene columna). Al pasar a él, la tarjeta
  desaparece del tablero y el pedido queda registrado completo.
- Filtro "En depósito" en la vista lista de pedidos para ver lo fabricado que
  espera cargarse como producto terminado.

**No entra (YAGNI):**

- Stock de producto terminado: el sistema NO lleva disponibilidad de productos
  fabricados. Cuando se venda, se carga un pedido normal con cliente.
- Nada de Alegra: no se emiten documentos ni se crean contactos para estos
  pedidos.
- Notificaciones al admin: el lugar de descubrimiento es el filtro de la lista.
- Convertir un pedido normal a para stock (o al revés) después de creado.

## Modelo de datos

Migración nueva en `scripts/` (siguiente número libre):

```sql
ALTER TABLE orders ADD COLUMN for_stock BOOLEAN NOT NULL DEFAULT FALSE;
```

Decisiones:

- `customer_external_id` es NOT NULL hoy. Para los pedidos para stock se guarda
  el valor fijo `'stock'`, siguiendo la convención de los `'manual:xxx'` que ya
  existen; `customer_name` queda NULL. La UI muestra "Producción propia" cuando
  el external_id es `'stock'`. No se hace nullable la columna para no tocar los
  usos existentes (mapeo con Alegra, matcheo del CRM).
- Estado nuevo `en_deposito` en `ORDER_STATUSES` de `lib/order-statuses.ts`,
  **fuera de `BOARD_STATUSES`** — el mismo patrón con el que `cancelado` no tiene
  columna en el tablero. `STATUS_LABELS.en_deposito = "En depósito"` y
  `DEFAULT_CUSTOMER_STATUS.en_deposito = "En depósito"` (TypeScript fuerza
  completar ambos records al agregar la clave; el bot nunca lo usa porque estos
  pedidos no tienen cliente).

## Alta (components/new-order-page.tsx)

- Switch "Producción para stock" arriba de todo en el form. Activado, el campo
  Cliente no se renderiza.
- Al crear con el switch activo, `createOrderManual` recibe `for_stock: true` y
  sin cliente: saltea la validación de `customer.external_id`, fija
  `customer.external_id = 'stock'` y `customer_name = null`.
- Permisos: igual que hoy, cualquier usuario logueado puede crear pedidos.

## Tablero y detalle

- El tablero no cambia: `en_deposito` no está en `BOARD_STATUSES`, no hay
  columna y no se puede arrastrar ahí.
- `components/order-status-select.tsx` (el selector del detalle): para pedidos
  `for_stock` muestra la opción "En depósito" y oculta "Preparando entrega" y
  "Listo para retirar" (dispararían la emisión, que no aplica). Para pedidos
  normales no cambia nada.
- Guardas server-side en `updateOrderStatus` (`lib/order-actions.ts`):
  - `en_deposito` solo se acepta si el pedido tiene `for_stock = true`.
  - `por_facturar` y `listo_para_retirar` se rechazan si `for_stock = true`
    (evita emitir documentos sin cliente en Alegra).

## Vista lista

Filtro "En depósito" junto a los filtros existentes de la vista lista de pedidos
(`/pedidos?vista=lista`): lista los pedidos con estado `en_deposito`. Es el lugar
donde el admin ve lo fabricado esperando cargarse como producto terminado.

## Consumo de materiales

Sin cambios: el consumo por pedido (detalle del pedido / "consumir desde
pedido") funciona igual para los pedidos para stock.

## Errores

- Las guardas de estado devuelven `{ error }` con texto legible ("Este pedido es
  de producción propia: no se factura" / "Solo los pedidos para stock pasan a en
  depósito") y la UI lo muestra con `toast.error`, igual que el resto de
  `order-actions.ts`.

## Testing

- `lib/order-validation.ts`: pedido para stock sin cliente pasa la validación;
  pedido normal sin cliente sigue fallando como hoy.
- `updateOrderStatus`: `en_deposito` rechazado en pedido normal; `por_facturar`
  rechazado en pedido para stock.
- `lib/order-statuses.ts`: `en_deposito` presente en `ORDER_STATUSES` y ausente
  de `BOARD_STATUSES`; labels completos.
- Manual: alta sin cliente → tablero → detalle → "En depósito" → desaparece del
  tablero → aparece en el filtro de la lista.

## Preguntas resueltas durante el brainstorming

- El producto terminado no lleva stock en el sistema: solo se registra la
  producción; al venderse se carga un pedido normal.
- Se marca con un interruptor en el alta (no con un cliente especial "Stock").
- El estado final no se ve en el tablero: solo se elige desde la vista del
  pedido y la tarjeta desaparece.
- Lo fabricado esperando se ve con un filtro "En depósito" en la vista lista.
- Cualquier usuario logueado puede crear/marcar pedidos para stock.
