# Diseño: sección de Gastos para el admin

**Fecha:** 2026-09-07
**Estado:** aprobado para implementar (pendiente plan de implementación)

## Contexto

El admin no tiene dónde registrar los gastos operativos de la empresa (alquiler, servicios, impuestos, bancarios, oficina). Hoy esos números no están en el sistema, y las compras de material viven en el módulo de stock — con dos silos no se puede responder "¿cuánto gastamos este mes?".

El usuario tiene un proyecto personal (`~/Documents/expense-tracker`, Next.js 14 + shadcn/ui + Neon) cuya UI de dashboard por mes y categorías sirve de referencia visual. La funcionalidad vive **dentro de esta app** (no se usa la app separada) para compartir auth, roles y base de datos con el resto de la operación.

## Alcance

**Sí entra:**

- Cargar gastos operativos sueltos: fecha, categoría, descripción, monto, medio de pago.
- Categorías de gasto creadas/editables por el admin (patrón de familias de materiales).
- Vista mensual: total del mes + totales por categoría + detalle del mes.
- Editar y borrar gastos cargados (borrado con confirmación).

**No entra (YAGNI):**

- Compras de materiales (ya están en el módulo de stock) ni sueldos/personal.
- Adjuntar comprobantes/fotos (solo datos; Vercel no guarda archivos).
- Gastos fijos/recurrentes ni propagación automática.
- Estado pagado/pendiente (el gasto se carga cuando ya se pagó; eso tiene sentido en finanzas personales, no acá).
- Exportación / reportes fuera de la pantalla mensual.
- Nada de esto es visible para el rol operador.

## Modelo de datos

Migración nueva en `scripts/` (siguiente número libre):

```sql
CREATE TABLE expense_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,  -- 'efectivo' | 'transferencia' | 'tarjeta' | 'otro'
  created_by TEXT NOT NULL,      -- nombre del usuario de sesión (auditoría)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);
```

Decisiones:

- `payment_method` es una lista corta **fija en código** (select de 4 opciones), no editable: no merece tabla propia.
- `created_by` guarda el nombre del usuario de sesión al cargar; no es FK a users para no acoplar (igual criterio que `stock_movements.user_name`).
- Categorías con `active` en vez de borrado físico: una categoría usada por gastos viejos no se borra, se desactiva y desaparece del selector de carga.

## Ruta y navegación

- Ruta `/gastos`, server page con `dynamic = "force-dynamic"`.
- Ítem nuevo "Gastos" en el sidebar (sección Gestión, `adminOnly: true`, ícono `Wallet` o `Banknote` de lucide).
- El mes se selecciona por searchParam `?mes=YYYY-MM` (default: mes actual). Navegación con flechas no usa estado local: cambia el searchParam.

## Permisos

- La página exige sesión admin: sin sesión → `/login`; rol operador → redirect a `/` (donde el operador tiene su inicio).
- Las server actions **re-validan el rol admin** adentro (no confían en la UI) y devuelven `{ error }` como el resto de `lib/order-actions.ts`.
- El CRUD de categorías es admin-only por las mismas vías.

## La pantalla

Server page `app/(dashboard)/gastos/page.tsx`:

1. **Barra superior**: título "Gastos", selector de mes (`‹ septiembre 2026 ›`), botón "Nuevo gasto".
2. **Total del mes**: monto grande formateado es-AR, arriba de todo (es la primera pregunta al entrar).
3. **Totales por categoría** (lo primero que se ve según lo pedido): barras horizontales proporcionales al monto del mes. Cada fila: nombre de categoría, monto y % del total. Referencia visual: dashboard por categoría del expense-tracker personal, adaptado al estilo de esta app (tipografía y colores de tema). Monto formateado con función nueva `formatMoney` en `lib/format.ts`, siguiendo el patrón de `formatStock`.
4. **Detalle del mes**: lista/tabla con fecha, descripción, categoría, medio de pago y monto. Cada fila tiene editar (abre el mismo modal de carga, precargado) y borrar (`ConfirmDialog`, patrón de `components/orders-table.tsx`).
5. **Categorías**: botón secundario "Categorías" en la barra superior que abre el manager de categorías: crear, renombrar, activar/desactivar. Patrón: `components/material-families-manager.tsx`.

## Carga y edición

`components/expense-dialog.tsx` (patrón `StockMovementDialog`): modal con

- Fecha (input date, default hoy; puede ser pasada, **no futura**).
- Categoría (select de categorías activas).
- Descripción (texto corto, requerido).
- Monto (numérico, > 0).
- Medio de pago (select fijo de 4 opciones).

Al guardar: server action en `lib/gastos.ts`, `router.refresh()` y toast de confirmación, igual que el resto de las acciones.

## Validación (server-side, testeable)

En `lib/gastos.ts` (o `lib/gastos-validation.ts` si crece), función pura estilo `lib/__tests__/order-validation.test.ts`:

- Monto numérico > 0 (rechazar 0, negativos, no-numéricos).
- Descripción no vacía (con trim).
- Fecha presente y no futura.
- `category_id` existe y está activa (en alta; en edición, si la categoría fue desactivada después, se permite conservarla pero no seleccionarla nueva).
- `payment_method` dentro de las 4 opciones válidas.

## Totales por categoría (testeable)

Función pura que, dado el listado de gastos del mes, devuelve `[{ categoria, monto, pct }]` ordenado por monto descendente. Test: suma correcta, orden, % sobre total, meses vacíos.

## Errores

- Toda server action devuelve `{ error }` y la UI lo muestra con `toast.error` (hook `use-toast`, como en `order-actions.ts`).
- Error de permisos en la action → redirect a `/login` vía la página; la action devuelve error genérico.

## Testing

- `vitest run`: tests de validación y de totales por categoría (funciones puras, sin tocar la base).
- Manual: carga → aparece en el mes; edición cambia totales; borrado con confirmación; categoría desactivada no aparece en el selector; operador no ve el menú ni la ruta.

## Preguntas resueltas durante el brainstorming

- Alcance: solo gastos operativos sueltos (no materiales, no sueldos, no recurrentes).
- Categorías: editables por el admin (no lista fija, no libre).
- Sin adjuntar comprobantes.
- Vista principal: totales por categoría.
- Se puede editar y borrar; la fecha puede ser pasada o de hoy, no futura.
