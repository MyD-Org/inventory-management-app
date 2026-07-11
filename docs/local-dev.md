# Desarrollo local (sin Neon ni deploys)

Stack local completo para probar la app — incluidos los **Dashboards IA** — contra un
Postgres local con data de prueba.

```
App (:3005) ──HTTP──> neon-proxy (:4444) ──pg──> Postgres docker (db "avantec")
   │ chat (/ai-api rewrite)
   └────> ai-api local (:3000) ────────────────> Postgres docker (db "ai_api")
```

> Por qué el proxy: `@neondatabase/serverless` habla **SQL-sobre-HTTP** (protocolo de
> Neon), no el protocolo Postgres. `lib/neon-local.ts` redirige el driver al proxy
> cuando `NEON_LOCAL_PROXY` está seteada (en Vercel no existe → no hace nada).

## 1. Postgres + proxy (docker)

```bash
# Postgres (si no existe ya un contenedor postgres en :5432)
docker run -d --name ai-api-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
docker exec ai-api-pg psql -U postgres -c "CREATE DATABASE avantec;"

# Schema + data: correr scripts/01..11 en orden + tabla users + admin
for f in scripts/0*.sql scripts/1*.sql; do docker exec -i ai-api-pg psql -U postgres -d avantec < "$f"; done
node scripts/create-users-table.js   # (requiere DATABASE_URL+NEON_LOCAL_PROXY en el env)
# o crear el admin a mano: users(email admin@example.com, password bcrypt('admin'), role admin)

# Proxy Neon→Postgres local
docker run -d --name neon-proxy -p 4444:4444 \
  -e PG_CONNECTION_STRING="postgres://postgres:postgres@host.docker.internal:5432/avantec" \
  ghcr.io/timowilhelm/local-neon-http-proxy:main
```

## 2. ai-api local con el tenant Avantec

En el repo `ai-api` (Postgres local db `ai_api`, migraciones aplicadas):

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_api \
AVANTEC_URL=http://localhost:3005 \
AVANTEC_INTERNAL_SECRET=dev-internal-secret \
ENCRYPTION_KEY=<la del .env de ai-api> \
npm run seed:avantec        # imprime AVANTEC_AI_API_KEY + los dos agent ids
npm run dev                 # :3000
```

## 3. `.env.local` de esta app

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/avantec
NEON_LOCAL_PROXY=http://localhost:4444/sql
AUTH_SECRET=<cualquier string de 32+>
AI_API_BASE_URL=http://localhost:3000
AVANTEC_AI_API_KEY=<ak_… del seed>
INTERNAL_SECRET=dev-internal-secret
NEXT_PUBLIC_AI_AGENT_ID=<id agente inventario>
NEXT_PUBLIC_AI_DASHBOARD_AGENT_ID=<id agente dashboard-builder>
```

## 4. Correr

```bash
pnpm next dev -p 3005   # :3000 lo usa ai-api
# login: admin@example.com / admin → menú "Dashboards IA"
```

Tip: para que los dashboards de ventas tengan data, el espejo Alegra local necesita
filas (alegra_clients/sales_documents/sales_items/payments) — importar con
`scripts/import-alegra.js` o insertar data de prueba.
