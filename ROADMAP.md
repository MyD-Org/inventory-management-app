# Roadmap — Avantec

Visión: pasar de un sistema de inventario a una **plataforma integrada** para administrar
materias primas, calcular costos reales de fabricación, gestionar mano de obra, generar
presupuestos comerciales, sincronizarlos con Alegra y usar IA en todo el flujo.

## ✅ Hecho

- **Inventario** con código de barras, movimientos (entradas/salidas/ajustes) con atribución
  real del usuario (sesión server-side), alertas de stock bajo.
- **Asistente de IA** (burbuja flotante): consultas de inventario y movimientos, propone
  listas de materiales para fabricar algo. Backend: ai-api (tenant "Avantec", agente
  `inventario`), widget `@myd-org/ai-widget` ≥0.1.2. Tools read-only en `/api/ai-tools/*`.
- **Costos de fabricación** (`/costos`): producto/proyecto = materiales del inventario
  (costo real, snapshot + "actualizar precios") + mano de obra + otros costos; margen % →
  costo de producción, precio de venta sugerido y ganancia en vivo. La IA precarga el
  editor vía la tarjeta "Calcular costo" (match por `materialId`).
- **Recursos de mano de obra** (`/settings/recursos`): empleados propios, contratistas,
  talleres externos, instaladores y tercerizados, con **valor por mes** (o por hora, campo
  bidireccional); costo/hora derivado = `valor mensual ÷ app_settings.work_hours_per_month`
  (206 = L-V 8:00–17:30).
- **Presupuestos comerciales** (`/presupuestos`): cotización a clientes que **reutiliza** los
  costos ya calculados. Se agregan productos costeados (precio de venta sugerido = costo ×
  (1 + margen), editable) + ítems manuales, con cantidades, descuento global % y total en
  vivo; estados borrador/enviado/aceptado/rechazado; **vista imprimible → PDF** (window.print).
  Tablas `quotes` / `quote_items` (`quote_items.budget_id` referencia el costo de origen y
  congela label/precio al cotizar). Concepto separado de costos de fabricación.

## Fase: Enviar el presupuesto al cliente (email / WhatsApp)

Hoy el presupuesto se exporta como PDF (imprimir). Falta el envío directo: generar un link
público o adjuntar el PDF y mandarlo por email o WhatsApp desde la ficha del presupuesto.

## Fase: IA presupuestadora completa

Además del BOM de materiales, la IA debería:

- **Sugerir mano de obra** usando los recursos registrados: nueva tool `get_labor_resources`
  (GET `/api/ai-tools/labor-resources`) + extender la card `build_budget` con líneas de
  labor (`hours`/`hourlyRate`/`resourceId`) en ai-api y ai-widget.
- Aplicar el margen configurado y **sugerir precio de venta** en la conversación.
- Asistir también en la creación del presupuesto comercial ("armale un presupuesto al
  cliente X con 2 portones").
- La decisión final siempre es del usuario: la IA propone, el editor decide.

## ✅ Integración con Alegra (cotizaciones) — hecho

Desde un presupuesto guardado, botón **"Crear en Alegra"**: buscador en vivo de contactos
de Alegra (con alta si no existe) y, por cada producto que no exista como ítem en Alegra,
el usuario decide **crear el producto** (guarda el vínculo `budgets.alegra_item_id` →
sin duplicados en cotizaciones futuras) o mandarlo como **ítem genérico** ("Trabajo de
fabricación") con el detalle en la descripción. Crea el estimate (`POST /estimates`,
descuento global por línea, notas como observaciones, vigencia 15 días) y guarda
`quotes.alegra_estimate_id/number/contact_id` + link directo. Requiere `ALEGRA_EMAIL` +
`ALEGRA_TOKEN` en `.env` (sin eso el botón no aparece). Auth Basic email+token,
base `https://api.alegra.com/api/v1` (aprendizajes del proyecto Central Led).

Pendiente de esta fase: enviar la cotización por mail DESDE Alegra vía API, y sincronizar
el estado (aceptada/rechazada) de vuelta a Avantec (Alegra no tiene webhooks → sería polling).

## Notas técnicas

- El módulo de costos usa las tablas `budgets`, `budget_materials`, `budget_labor`
  (FK `resource_id` → `labor_resources`), `budget_extras` y `app_settings`
  (`default_margin_pct`, `work_hours_per_month`). Scripts: `scripts/04-*.sql`, `scripts/05-*.sql`.
- El agente de IA se configura en ai-api con `scripts/seed-avantec.ts`
  (tenant settings: `guardrails`, `budget_tool`, `budget_tool_description`, `handoff_tools:false`).
