# AI Dashboards en Avantec — plan de integración (sub-proyecto 4/5)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Spec paraguas en
> `platform/docs/superpowers/specs/2026-07-10-ai-dashboard-builder-design.md`. RAMA + PR,
> NUNCA main (auto-deploya a Vercel).

**Goal:** Los usuarios admin de Avantec crean/iteran dashboards por chat sobre SUS datos reales (inventario, quotes, espejo Alegra) y los guardan.

**Architecture:** Paquetes vendorizados como tgz (patrón existente de ai-widget). El workspace (`DashboardView` + `ChatPanel`) es un client component; `executeQuery` pega a `POST /api/dashboards/query` (SELECT-only, LIMIT forzado, auth admin, Neon vía `DASHBOARDS_DATABASE_URL` con fallback a `DATABASE_URL` — en prod apuntarla a un rol read-only). Persistencia en tabla `dashboards` con rutas CRUD. El agente `dashboard-builder` del tenant Avantec se agrega a `seed-avantec.ts` en ai-api con knowledge = schema real (tablas + vistas Alegra).

**Tech Stack:** Next 14 (app router) + React 19 + Tailwind v4 + next-auth v5 + @neondatabase/serverless; pnpm (lock que usa Vercel).

## Global Constraints

- Textos es-AR; seguir patrones del repo (auth() + redirect, sql tagged, force-dynamic).
- El chat SOLO admin (mismo gate que /api/ai/token).
- Env nuevas: `NEXT_PUBLIC_AI_DASHBOARD_AGENT_ID` (id que imprime el seed), opcional `DASHBOARDS_DATABASE_URL` (rol RO).

## Tasks

1. **Rama `feat/ai-dashboards`** + vendor tgz de `@myd-org/{ui@0.5.1, sdui@0.5.1, sdui-dashboard@0.1.0, ai-widget@0.1.8}` (npm pack → `vendor/`), deps `file:vendor/...` (ai-widget reemplaza 0.1.7), `pnpm install` (sincroniza lock).
2. **CSS**: `app/globals.css` importa `@myd-org/ui/tailwind.css` + `@source` de los dist vendorizados (Tailwind v4 compila las utilidades del DS; los tokens `--color-*` del DS no chocan con los `--background/--primary` shadcn de Avantec).
3. **`scripts/11-dashboards.sql`**: tabla `dashboards` (id serial, name, document jsonb, created_by, created_at, updated_at).
4. **`lib/dashboards.ts`**: `assertSelectOnly(source)` (ignora líneas `--`, exige SELECT/WITH inicial, prohíbe `;` intermedios) + `withLimit(source, 10000)` (append si no hay LIMIT final) + tipos.
5. **`app/api/dashboards/query/route.ts`**: POST {source, params[]} → auth admin → validación → `sql.query` (Neon RO) → filas. Errores 400/500 con `{error}`.
6. **CRUD**: `app/api/dashboards/route.ts` (GET list, POST create) y `app/api/dashboards/[id]/route.ts` (GET/PUT/DELETE), auth requerida.
7. **UI**: `components/dashboards/dashboard-workspace.tsx` ('use client': DashboardView + ChatPanel con kind dashboard_builder/getPageContext/onEvent + guardar con isDirty) + páginas `app/(dashboard)/dashboards/page.tsx` (lista server), `/dashboards/nuevo`, `/dashboards/[id]` + entrada "Dashboards IA" en `components/app-shell.tsx` (adminOnly).
8. **ai-api** (repo nuestro, main): extender `scripts/seed-avantec.ts` con agente `dashboard-builder` (mismas reglas del demo pero knowledge = **schema real** de Avantec: materials/inventory/stock_movements/quotes(+items)/budgets y vistas alegra_*; sin marcadores de vista — acá el SQL es real).
9. **Verificación**: `pnpm build` + `npx tsc --noEmit` verdes → commit → push rama → **PR** (con checklist de deploy: correr 11-dashboards.sql, correr seed:avantec actualizado, setear envs).

## Fuera de alcance

Edición manual (SP5), publicar/compartir, RO-role provisioning automático (manual en Neon), tests e2e contra Neon real (se valida en el preview del PR).
