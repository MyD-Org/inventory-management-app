# Automatizaciones v1 — host Avantec (sub-proyecto 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superficie de automatizaciones en Avantec: endpoint de query para el motor de ai-api, CRUD proxy, páginas `/automations` (listado, form completo, historial) y card de confirmación de propuestas del chat.

**Architecture:** Spec paraguas: `platform/docs/superpowers/specs/2026-07-11-automatizaciones-design.md`. El motor vive en ai-api (ya implementado en la rama `feat/automatizaciones` de ai-api): acá solo va (1) `POST /api/automations/query` — hermano de `/api/ai-tools/query` pero body `{sql}`, header `x-automations-secret`, tope 10000; (2) proxy server-side al CRUD `/v1/automations` de ai-api (patrón de `/api/ai/token`: la key `ak_` nunca llega al browser); (3) páginas admin calcadas del patrón dashboards/suppliers; (4) en `DashboardWorkspace`, manejar el evento SSE `automation` como PROPUESTA con confirmación explícita antes de crear.

**Tech Stack:** Next.js 14 app router, next-auth v5 beta (gate por página/route, NO middleware), `@neondatabase/serverless` (`dashboardsSql` RO), shadcn/ui local, pnpm.

## Global Constraints

- **Rama: `feat/automations` creada DESDE `feat/ai-dashboards`. JAMÁS commitear/pushear `main`** (auto-deploy Vercel). PR final → `feat/ai-dashboards`.
- No hay framework de tests en este repo: el gate por task es `pnpm exec tsc --noEmit` verde; `pnpm build` una vez al final (Task 5).
- Auth de páginas y API routes de automations: **admin-only** (patrón exacto `app/api/dashboards/query/route.ts:10-16`: `session.user` → 401, `role !== 'admin'` → 403; páginas: `redirect('/login')` / `redirect('/')`).
- El secret del endpoint de query se compara **timing-safe** (`crypto.timingSafeEqual`), a diferencia del `===` de `lib/ai-tools-auth.ts`.
- Contrato del endpoint de query (de `platform/contracts/automations.md`): request `{ sql }`, response `{ rows }`, header `x-automations-secret`, `assertSelectOnly` + `withLimit(10000)` de `lib/dashboards.ts`.
- El CRUD de ai-api espera/devuelve: `GET|POST /v1/automations`, `GET|PATCH|DELETE /v1/automations/:id`, `GET /v1/automations/:id/runs|events`, `GET /v1/automation-events?limit=N`; auth `Authorization: Bearer ${AVANTEC_AI_API_KEY}`; errores `{ error: slug, details?: string[] }`; 422 `invalid_automation`.
- Shape de una automatización (contrato, campos flat): `{ id?, name, sql, mode: 'row'|'aggregate', condition: {column, op: gt|gte|lt|lte|eq|neq, value}, entityKeyColumn?, intervalMinutes (>=5, default 60), rearmPolicy: 'on_clear'|'remind', remindEveryHours?, actions: [email {to,subject,body} | webhook {url,secret?} | whatsapp_template {to,templateName,params?}], dashboardId?, createdBy: 'chat'|'form' }` + de lectura: `enabled, pausedReason, lastRunAt, lastRunStatus, nextRunAt, consecutiveFailures, createdAt`.
- Envs nuevas: ninguna obligatoria (`INTERNAL_SECRET` se reutiliza como secret del data source). `AI_API_BASE_URL` y `AVANTEC_AI_API_KEY` ya existen.
- Commits en español estilo repo + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. `git add` con paths explícitos.
- UI en español (es-AR), shadcn/ui local (`components/ui/*`), lucide-react para íconos.

---

### Task 1: Endpoint `POST /api/automations/query`

**Files:**
- Create: `lib/automations-auth.ts`, `app/api/automations/query/route.ts`

**Interfaces:**
- Consumes: `assertSelectOnly`, `withLimit`, `dashboardsSql` de `@/lib/dashboards` (firmas en `lib/dashboards.ts:28-48`).
- Produces: endpoint server-to-server que consume el motor de ai-api (`src/automations/datasource.ts` manda `POST` con header `x-automations-secret` y body `{sql}`, espera `{rows}` con status 200).

- [ ] **Step 1: Implementar el guard timing-safe**

```ts
// lib/automations-auth.ts
import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

// Guard server-to-server del motor de automatizaciones de ai-api.
// Mismo secreto compartido que las tools (INTERNAL_SECRET), registrado en ai-api
// vía PUT /v1/data-source. Header propio del contrato: x-automations-secret.
export function requireAutomationsSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_SECRET
  if (!secret) {
    return NextResponse.json({ error: "INTERNAL_SECRET no configurado" }, { status: 503 })
  }
  const header = request.headers.get("x-automations-secret") ?? ""
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  return null
}
```

- [ ] **Step 2: Implementar la ruta**

```ts
// app/api/automations/query/route.ts
import { NextResponse, type NextRequest } from "next/server"
import { requireAutomationsSecret } from "@/lib/automations-auth"
import { assertSelectOnly, dashboardsSql, withLimit } from "@/lib/dashboards"

// Endpoint del contrato de automatizaciones (platform/contracts/automations.md):
// lo consume el motor de ai-api en cada evaluación. Body {sql} -> {rows}.
// Tope alto (10000) a diferencia de /api/ai-tools/query (50, pensado para el agente).
export async function POST(request: NextRequest) {
  const unauthorized = requireAutomationsSecret(request)
  if (unauthorized) return unauthorized

  let body: { sql?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (typeof body.sql !== "string" || !body.sql.trim()) {
    return NextResponse.json({ error: "Falta sql" }, { status: 400 })
  }

  let source: string
  try {
    source = withLimit(assertSelectOnly(body.sql), 10000)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "SQL inválido" }, { status: 400 })
  }

  try {
    const rows = await dashboardsSql.query(source, [])
    return NextResponse.json({ rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error ejecutando la consulta"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
```

- [ ] **Step 3: Verificar** — Run: `pnpm exec tsc --noEmit` → sin errores. Con el dev server local levantado (opcional si ya está corriendo): `curl -s -X POST localhost:3005/api/automations/query -H 'x-automations-secret: <INTERNAL_SECRET del .env.local>' -H 'content-type: application/json' -d '{"sql":"SELECT 1 AS uno"}'` → `{"rows":[{"uno":1}]}`; sin header → 401.

- [ ] **Step 4: Commit**

```bash
git add lib/automations-auth.ts app/api/automations/query/route.ts
git commit -m "feat(automations): endpoint de query para el motor de ai-api (secret timing-safe, tope 10k)"
```

---

### Task 2: Proxy server-side al CRUD de ai-api

**Files:**
- Create: `lib/ai-api-automations.ts`, `app/api/automations/route.ts`, `app/api/automations/[id]/route.ts`, `app/api/automations/[id]/events/route.ts`, `app/api/automations/[id]/runs/route.ts`, `app/api/automations/events/route.ts`

**Interfaces:**
- Consumes: `auth` de `@/auth` (gate admin), envs `AI_API_BASE_URL` + `AVANTEC_AI_API_KEY` (patrón `app/api/ai/token/route.ts`).
- Produces: para las páginas y la card del chat: `GET/POST /api/automations`, `GET/PATCH/DELETE /api/automations/:id`, `GET /api/automations/:id/events`, `GET /api/automations/:id/runs`, `GET /api/automations/events?limit=N` — passthrough del JSON de ai-api con el mismo status code. Helper exportado: `aiApiAutomations(path: string, init?: RequestInit): Promise<Response>` y `requireAdmin(): Promise<NextResponse | null>`.

- [ ] **Step 1: Helper + guard admin**

```ts
// lib/ai-api-automations.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"

// Proxy fino al CRUD /v1/automations de ai-api. La API key ak_ vive SOLO en server
// (mismo principio que /api/ai/token). El browser solo habla con estas rutas admin.
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 })
  return null
}

export async function aiApiAutomations(path: string, init?: RequestInit): Promise<Response> {
  const base = process.env.AI_API_BASE_URL
  const key = process.env.AVANTEC_AI_API_KEY
  if (!base || !key) {
    return Response.json({ error: "AI_API_BASE_URL/AVANTEC_AI_API_KEY no configuradas" }, { status: 503 })
  }
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })
}

// Passthrough: mismo status y body que devuelva ai-api.
export async function proxyJson(res: Response): Promise<NextResponse> {
  const body = await res.json().catch(() => ({ error: "respuesta inválida de ai-api" }))
  return NextResponse.json(body, { status: res.status })
}
```

- [ ] **Step 2: Rutas**

```ts
// app/api/automations/route.ts
import { type NextRequest } from "next/server"
import { aiApiAutomations, proxyJson, requireAdmin } from "@/lib/ai-api-automations"

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return proxyJson(await aiApiAutomations("/v1/automations"))
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = await request.text()
  return proxyJson(await aiApiAutomations("/v1/automations", { method: "POST", body }))
}
```

```ts
// app/api/automations/[id]/route.ts
import { type NextRequest } from "next/server"
import { aiApiAutomations, proxyJson, requireAdmin } from "@/lib/ai-api-automations"

type Ctx = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin()
  if (denied) return denied
  return proxyJson(await aiApiAutomations(`/v1/automations/${params.id}`))
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = await request.text()
  return proxyJson(await aiApiAutomations(`/v1/automations/${params.id}`, { method: "PATCH", body }))
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin()
  if (denied) return denied
  const res = await aiApiAutomations(`/v1/automations/${params.id}`, { method: "DELETE" })
  if (res.status === 204) return new Response(null, { status: 204 })
  return proxyJson(res)
}
```

```ts
// app/api/automations/[id]/events/route.ts
import { type NextRequest } from "next/server"
import { aiApiAutomations, proxyJson, requireAdmin } from "@/lib/ai-api-automations"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  return proxyJson(await aiApiAutomations(`/v1/automations/${params.id}/events`))
}
```

```ts
// app/api/automations/[id]/runs/route.ts
import { type NextRequest } from "next/server"
import { aiApiAutomations, proxyJson, requireAdmin } from "@/lib/ai-api-automations"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  return proxyJson(await aiApiAutomations(`/v1/automations/${params.id}/runs`))
}
```

```ts
// app/api/automations/events/route.ts
import { type NextRequest } from "next/server"
import { aiApiAutomations, proxyJson, requireAdmin } from "@/lib/ai-api-automations"

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const limit = request.nextUrl.searchParams.get("limit") ?? "50"
  return proxyJson(await aiApiAutomations(`/v1/automation-events?limit=${encodeURIComponent(limit)}`))
}
```

**OJO ruteo Next:** `app/api/automations/events/route.ts` (estático) convive con `app/api/automations/[id]/...` (dinámico); Next prioriza el estático — `GET /api/automations/events` va al global, no a `[id]='events'`. Verificarlo en el step 3.

- [ ] **Step 3: Verificar** — `pnpm exec tsc --noEmit` verde. Si el dev server corre: `curl -s localhost:3005/api/automations` sin sesión → `{"error":"No autenticado"}` 401.

- [ ] **Step 4: Commit**

```bash
git add lib/ai-api-automations.ts app/api/automations/
git commit -m "feat(automations): proxy admin al CRUD /v1/automations de ai-api"
```

---

### Task 3: Páginas `/automations` (listado, form completo, historial) + nav

**Files:**
- Create: `app/(dashboard)/automations/page.tsx`, `app/(dashboard)/automations/nuevo/page.tsx`, `app/(dashboard)/automations/[id]/page.tsx`, `app/(dashboard)/automations/actividad/page.tsx`, `components/automations/automations-table.tsx`, `components/automations/automation-form.tsx`, `components/automations/automation-events.tsx`, `components/automations/automation-types.ts`
- Modify: `components/app-shell.tsx` (ítem de nav)

**Interfaces:**
- Consumes: rutas proxy de Task 2 (fetch client-side a `/api/automations...`); para "Probar query": el endpoint EXISTENTE `POST /api/dashboards/query` con body `{ source, params: [] }` (admin, mismo shape que usa `DashboardWorkspace:38-47`); shadcn/ui local (`Card`, `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Table`, `toast` de sonner); patrón página server component + client component (`settings/suppliers/page.tsx` → `SuppliersTable`).
- Produces: tipos compartidos en `components/automations/automation-types.ts` (los usa la Task 4): `AutomationInput`, `Automation` (input + campos de lectura), `AutomationAction`, `AutomationCondition` — mismos nombres/shape del Global Constraints; `describeAutomation(a: AutomationInput): string` (resumen humano: "dias > 30, por cliente_id, cada 60 min → email a {{email}}").

Lineamientos de implementación (los detalles visuales siguen el estilo del repo):

1. **`automation-types.ts`**: tipos TS flat del contrato (copiar del Global Constraints) + `describeAutomation`. Sin dependencias de React.
2. **Páginas** (server components, gate admin patrón dashboards: `if (!session?.user) redirect("/login"); if (session.user.role !== "admin") redirect("/")`): hacen el fetch inicial **server-side directo a ai-api** vía `aiApiAutomations()` de Task 2 (evita hop extra) y pasan data al client component. `export const dynamic = "force-dynamic"`.
3. **`/automations` (listado)** → `automations-table.tsx`: tabla con columnas Nombre / Estado (Badge: `Activa` verde, `Pausada` neutral, `Auto-pausada` destructive con tooltip del `pausedReason`) / Última evaluación (`lastRunAt` + `lastRunStatus`, formato es-AR) / Próxima (`nextRunAt`) / Acciones (switch o botón Pausar-Reanudar → `PATCH {enabled}` + `router.refresh()`, link Editar, botón Eliminar con `confirm()` → DELETE). Header con botones "Nueva automatización" (→ `/automations/nuevo`) y "Actividad" (→ `/automations/actividad`). Empty state con CTA.
4. **`automation-form.tsx`** (client, lo usan `nuevo` y `[id]`): campos controlados del contrato —
   - Nombre (Input), SQL (Textarea monospace, rows≈8).
   - Botón **"Probar query"**: POST `/api/dashboards/query` `{ source: sql, params: [] }`; muestra las primeras 5 filas en una tabla chica + guarda `Object.keys(rows[0])` como `columns`; los selects de `condition.column` y `entityKeyColumn` se pueblan con `columns` (con fallback a Input libre si aún no se probó). Errores → texto rojo inline.
   - Modo (Select row/aggregate; si `aggregate`, ocultar entityKeyColumn), Condición (Select columna + Select op con labels es-AR: "mayor a", "mayor o igual", "menor a", "menor o igual", "igual a", "distinto de" + Input value — numérico salvo eq/neq con texto), Frecuencia (Select presets: 5/15/30/60/240/1440 min), Re-disparo (Select: "Solo al entrar en condición" = on_clear / "Recordar cada N horas" = remind + Input remindEveryHours).
   - **Editor de acciones**: lista dinámica (agregar/quitar). Por acción un Select de tipo: Email (`to`, `subject`, `body` — hint: "acepta {{columna}} de la fila, ej {{email}}"), Webhook (`url`, `secret` opcional), WhatsApp template (`to`, `templateName`, `params` como inputs; nota visible: "Requiere templates aprobados por Meta — hasta entonces la acción queda registrada como pendiente").
   - Submit: POST `/api/automations` (nuevo) o PATCH `/api/automations/[id]`; en 422 mostrar `details[]` de ai-api arriba del form; éxito → toast + `router.push('/automations')`.
5. **`/automations/[id]`**: form pre-cargado + debajo `automation-events.tsx` con los eventos de ESA automatización (`GET /api/automations/[id]/events`, pasado server-side como initialData): tabla Fecha / Entidad (`entityKey`) / Tipo (`enter`→"Disparo", `remind`→"Recordatorio") / Acciones (badges por `actionsResult[]`: sent verde, failed destructive, skipped neutral, con `detail` como tooltip) / expandible con el `rowSnapshot` (`<pre>` JSON). También sección Runs recientes (colapsada o secundaria) con `GET .../runs`: startedAt, status, rowsReturned/matched/fired, error.
6. **`/automations/actividad`**: la misma `automation-events.tsx` con los eventos globales (`/api/automations/events?limit=100`) + columna extra con el nombre de la automatización (viene `automationId`; resolver el nombre con el listado que ya se fetchea server-side en la página).
7. **Nav** (`components/app-shell.tsx`, patrón línea 96): agregar junto a Dashboards IA:
   ```ts
   { label: "Automatizaciones", href: "/automations", icon: BellRing, adminOnly: true, flag: "ai_dashboards", activePrefixes: ["/automations/"] },
   ```
   (import `BellRing` de lucide-react; reutiliza el flag `ai_dashboards` — misma capability family, no crear flag nuevo en Vercel.)

- [ ] **Step 1: Implementar `automation-types.ts` + páginas + componentes según los lineamientos**
- [ ] **Step 2: Verificar** — `pnpm exec tsc --noEmit` verde; con dev server: navegar `/automations`, crear una automatización de prueba con el form (webhook a `https://example.com`), verla en el listado, editarla, pausarla, borrarla (requiere ai-api local corriendo con la rama feat/automatizaciones y el tenant con api key — si no está disponible, verificar al menos render + validaciones client y anotarlo en el report).
- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/automations components/automations components/app-shell.tsx
git commit -m "feat(automations): páginas de gestión (listado, form completo, historial) + nav admin"
```

---

### Task 4: Card de propuesta en el chat del dashboard

**Files:**
- Create: `components/automations/automation-proposal-card.tsx`
- Modify: `components/dashboards/dashboard-workspace.tsx`

**Interfaces:**
- Consumes: tipos + `describeAutomation` de `components/automations/automation-types.ts` (Task 3); el `onEvent` existente del `chatConfig` (`dashboard-workspace.tsx:61-66`); POST `/api/automations` (Task 2).
- Produces: al llegar el evento SSE `automation`, la UI muestra la propuesta y SOLO la persiste cuando el usuario confirma (decisión del spec: humano en el loop antes de que algo mande emails).

- [ ] **Step 1: Card**

```tsx
// components/automations/automation-proposal-card.tsx
"use client"

import { useState } from "react"
import { Bell, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { describeAutomation, type AutomationInput } from "./automation-types"

// Propuesta emitida por el agente (evento SSE `automation`). El emit NO crea nada:
// se persiste recién cuando el usuario confirma acá (POST /api/automations).
export function AutomationProposalCard({
  proposal,
  onDone,
}: {
  proposal: AutomationInput
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    try {
      const isEdit = Boolean(proposal.id)
      const res = await fetch(isEdit ? `/api/automations/${proposal.id}` : "/api/automations", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...proposal, createdBy: "chat" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const details = Array.isArray(data.details) ? `: ${data.details.join("; ")}` : ""
        throw new Error(`${data.error ?? "error"}${details}`)
      }
      toast.success(isEdit ? "Automatización actualizada" : "Automatización creada", {
        description: proposal.name,
      })
      onDone()
    } catch (err) {
      toast.error("No se pudo crear la automatización", {
        description: err instanceof Error ? err.message : undefined,
      })
      setSaving(false)
    }
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          {proposal.id ? "Actualizar automatización" : "Nueva automatización propuesta"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-medium">{proposal.name}</p>
        <p className="text-sm text-muted-foreground">{describeAutomation(proposal)}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={confirm} disabled={saving}>
            <Check className="mr-1 h-4 w-4" /> {proposal.id ? "Actualizar" : "Crear alerta"}
          </Button>
          <Button size="sm" variant="outline" onClick={onDone} disabled={saving}>
            <X className="mr-1 h-4 w-4" /> Descartar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Wiring en `dashboard-workspace.tsx`**

Estado nuevo `const [automationProposal, setAutomationProposal] = useState<AutomationInput | null>(null)`; en el `onEvent` existente agregar la rama:

```ts
if (name === "automation") {
  setAutomationProposal(payload as AutomationInput)
}
```

Render: la card flotante sobre el área del dashboard (o encima del dock del chat), `onDone={() => setAutomationProposal(null)}`. No tocar el flujo `dashboard`/`isDirty` existente.

- [ ] **Step 3: Verificar** — `pnpm exec tsc --noEmit` verde. Manual (si el stack local está corriendo): pedirle al agente "avisame cuando un cliente deba más de 30 días" → card visible → Crear → aparece en `/automations`.

- [ ] **Step 4: Commit**

```bash
git add components/automations/automation-proposal-card.tsx components/dashboards/dashboard-workspace.tsx
git commit -m "feat(automations): card de confirmación de propuestas del chat (evento SSE automation)"
```

---

### Task 5: E2E local + build + PR

**Files:**
- Modify (si hace falta): `docs/local-dev.md` (sección automatizaciones)

- [ ] **Step 1: Stack local** — receta `docs/local-dev.md`: pg docker `ai-api-pg` + neon-proxy :4444 + Avantec :3005; ai-api :3000 **desde el worktree `owns/ai-api-automations` (rama feat/automatizaciones)** con `npm run db:migrate` (aplica 0013) + `npm run seed:avantec`.
- [ ] **Step 2: Registrar el data source del tenant local** — con la api key `ak_` del tenant Avantec local:
  `curl -X PUT localhost:3000/v1/data-source -H "Authorization: Bearer $AK" -H 'content-type: application/json' -d '{"queryUrl":"http://localhost:3005/api/automations/query","secret":"<INTERNAL_SECRET del .env.local de Avantec>"}'` → 204.
- [ ] **Step 3: E2E caso canónico** — listener webhook efímero: `node -e 'require("http").createServer((q,s)=>{let b="";q.on("data",c=>b+=c);q.on("end",()=>{console.log(q.headers["x-automation-signature-256"],b);s.end("ok")})}).listen(9999)'`. Por CHAT: "avisame cuando un cliente tenga deuda vencida hace más de 30 días, con webhook a http://host.docker.internal:9999" (o localhost:9999 si ai-api corre sin docker) → confirmar card → en `/automations` poner intervalMinutes=5 si hace falta → esperar el tick (≤60s) → verificar: listener recibió el POST firmado con el shape del contrato; `/automations/actividad` muestra el evento con snapshot; segunda evaluación NO re-dispara (estado triggered); editar la condición a un umbral que nadie cumpla → siguiente run rearma (estados ok). Por FORM: crear otra con email (queda `skipped email_not_configured` si no hay RESEND_API_KEY — verificar que el historial lo muestre explícito).
- [ ] **Step 4: Build final** — `pnpm build` verde.
- [ ] **Step 5: Commit de docs si hubo + push + PR** — `git push -u origin feat/automations` y PR contra `feat/ai-dashboards` (JAMÁS main) con `gh pr create --base feat/ai-dashboards`, body con checklist de deploy: registrar data source en prod (PUT /v1/data-source con la URL pública + INTERNAL_SECRET), `RESEND_API_KEY`/`AUTOMATIONS_EMAIL_FROM` en Railway, y `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Fuera de alcance (v2, anotado en el spec)

Edición de automatizaciones POR CHAT desde su página (requiere generalizar el wrapper `page_context` de ai-api, hoy `<dashboard_actual>`); botón "Crear alerta" en el toolbar on-hover del widget; paso de agente; envío WhatsApp real (gate de templates Meta).
