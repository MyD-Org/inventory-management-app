# Diseño: estado único "Por facturar" con facturación automática en Alegra

## Resumen
Unificar los estados internos `embalado` y `facturado` en un único estado `por_facturar`. Al cambiar un pedido de `en_proceso` a `por_facturar` se emite automáticamente una factura en modo borrador en Alegra usando la lógica existente (`invoiceOrder`). Se mantiene el botón manual de facturación para reintentos y fallas.

## Estados

- `ORDER_STATUSES` pasa a: `por_revisar`, `recibido`, `en_proceso`, `por_facturar`, `listo_para_retirar`, `retirado`, `cancelado`.
- Se eliminan `embalado` y `facturado`.
- `STATUS_LABELS`: `por_facturar` → "Por facturar".
- `DEFAULT_CUSTOMER_STATUS`: `por_facturar` → "En preparación".
- `API_EDITABLE_STATUSES` sigue siendo `por_revisar`, `recibido`, `en_proceso`.

## Flujo de facturación automática

En `lib/order-actions.ts`, `updateOrderStatus`:

1. Actualiza `orders.status` a `por_facturar`.
2. Si el pedido no tiene `alegra_invoice_id`, llama a `invoiceOrder(orderId, { terms, notes })`.
3. `invoiceOrder` es idempotente: si ya hay factura, no emite otra.
4. Si la llamada falla, el estado igual cambia y queda marcado como "Falta factura".
5. Si sale con avisos, se guardan en `invoice_warnings`.

## Permisos

- Cualquier usuario logueado puede mover a `por_facturar`.
- La facturación automática usa credenciales de servidor.
- El botón manual sigue siendo solo admin.

## Migración de datos

- Actualizar el `CHECK` de `orders.status`.
- Migrar pedidos existentes en `embalado` y `facturado` a `por_facturar`.
- Actualizar el mapa por defecto en `app_settings.order_customer_status`.

## UI

- Tablero Kanban: una sola columna "Por facturar".
- Tarjeta: badge "Falta factura" si no tiene `alegra_invoice_id`.
- Detalle: botón manual solo si está en `por_facturar` y falta factura.

## Manejo de errores

- Falla de facturación automática: se loguea, el estado cambia, y se muestra indicador de falta factura.
- El admin puede usar el botón manual para reintentar.

## Testing

- Mover a `por_facturar` dispara `invoiceOrder`.
- No se emite factura duplicada.
- Pedidos viejos quedan en `por_facturar`.
