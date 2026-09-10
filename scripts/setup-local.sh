#!/usr/bin/env bash
# Levanta el entorno LOCAL completo: Postgres en docker, el proxy de Neon, el
# schema entero y un admin para entrar.
#
# POR QUÉ EXISTE: docs/local-dev.md tiene los pasos, pero son seis, hay que
# hacerlos en un orden que no es obvio y equivocarse no falla — te deja
# trabajando contra producción sin decir nada. Este script los hace en orden y
# se planta antes de tocar nada si el entorno apunta a Neon.
#
# Es IDEMPOTENTE: si los contenedores ya existen los reusa, y el schema se
# aplica con IF NOT EXISTS. Correlo las veces que quieras.
#
#   bash scripts/setup-local.sh
set -euo pipefail

PG_CONTAINER=ai-api-pg
PROXY_CONTAINER=neon-proxy
DB=avantec
PROXY_URL=http://localhost:4444/sql
LOCAL_URL="postgres://postgres:postgres@localhost:5432/$DB"

command -v docker >/dev/null || { echo "❌ Falta docker."; exit 1; }

# ---------- 1. Lo primero: que .env.local no apunte a producción ----------
# Va ANTES que todo lo demás. Levantar la base local y después correr los
# scripts contra Neon es exactamente el accidente que este archivo evita.
entorno_mal() {
    cat <<MSG
❌ $1

   .env.local tiene que tener EXACTAMENTE estas dos líneas, y ninguna otra
   DATABASE_URL:

     DATABASE_URL=$LOCAL_URL
     NEON_LOCAL_PROXY=$PROXY_URL

   (no se edita solo a propósito: ese archivo tiene tus credenciales)
MSG
    exit 1
}

[ -f .env.local ] || entorno_mal "No existe .env.local."
grep -qE '^\s*NEON_LOCAL_PROXY=' .env.local \
    || entorno_mal "Falta NEON_LOCAL_PROXY: la app y los scripts van a Neon de PRODUCCIÓN."

# El proxy no alcanza. Las credenciales viajan con la conexión, así que un
# DATABASE_URL de Neon apuntado al Postgres local falla con "password
# authentication failed for user neondb_owner": el usuario de Neon no existe acá.
repetidas=$(grep -cE '^\s*DATABASE_URL=' .env.local || true)
[ "$repetidas" -le 1 ] \
    || entorno_mal "Hay $repetidas líneas DATABASE_URL en .env.local: dejá una sola."
# if/then y no "grep && …": con set -e, un grep que no matchea corta el script.
if grep -qE '^\s*DATABASE_URL=.*(neon\.tech|neondb_owner)' .env.local; then
    entorno_mal "DATABASE_URL apunta a Neon. Para local va la de abajo."
fi

echo "✅ .env.local apunta a la base local"

# ---------- 2. Postgres ----------
if docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    docker start "$PG_CONTAINER" >/dev/null
    echo "✅ Postgres ya existía, arrancado"
else
    docker run -d --name "$PG_CONTAINER" -e POSTGRES_PASSWORD=postgres \
        -p 5432:5432 postgres:16-alpine >/dev/null
    echo "✅ Postgres creado"
fi

echo -n "   esperando a que acepte conexiones"
for _ in $(seq 1 30); do
    docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
    echo -n "."; sleep 1
done
echo

docker exec "$PG_CONTAINER" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" \
    | grep -q 1 || docker exec "$PG_CONTAINER" psql -U postgres -c "CREATE DATABASE $DB;" >/dev/null
echo "✅ Base $DB lista"

# ---------- 3. El proxy ----------
# El driver de Neon habla SQL-sobre-HTTP; un Postgres pelado no lo entiende.
if docker ps -a --format '{{.Names}}' | grep -qx "$PROXY_CONTAINER"; then
    docker start "$PROXY_CONTAINER" >/dev/null
    echo "✅ Proxy de Neon ya existía, arrancado"
else
    docker run -d --name "$PROXY_CONTAINER" -p 4444:4444 \
        -e PG_CONNECTION_STRING="postgres://postgres:postgres@host.docker.internal:5432/$DB" \
        ghcr.io/timowilhelm/local-neon-http-proxy:main >/dev/null
    echo "✅ Proxy de Neon creado"
fi

# ---------- 4. La tabla de usuarios, ANTES del schema ----------
# 26-must-change-password.sql modifica `users`, y `users` la crea este script de
# Node, no un .sql. Al revés esa migración falla.
node scripts/create-users-table.js >/dev/null
echo "✅ Tabla de usuarios"

# ---------- 5. El schema, en orden numérico ----------
# sort -V y no el orden alfabético: sin eso la 41 correría antes que la 5.
for f in $(ls scripts/[0-9]*.sql | sort -V); do
    docker exec -i "$PG_CONTAINER" psql -U postgres -q -d "$DB" < "$f" >/dev/null 2>&1 \
        || echo "   ⚠️  $f dio error (puede ser normal si depende de datos)"
done
echo "✅ Schema aplicado ($(ls scripts/[0-9]*.sql | wc -l | tr -d ' ') archivos)"

# ---------- 6. Admin y datos de ejemplo ----------
node scripts/seed-admin.js >/dev/null
docker exec -i "$PG_CONTAINER" psql -U postgres -q -d "$DB" < scripts/seed-remitos-parciales.sql >/dev/null
echo "✅ Admin (admin@example.com / admin) y pedidos de ejemplo"

cat <<MSG

Listo. Arrancá con:  pnpm next dev -p 3005

Para comprobar contra qué base estás escribiendo, cualquier script lo dice:
  node scripts/run-sql.js scripts/41-remitos-parciales.sql
  ▶ Base: LOCAL, la que sirva $PROXY_URL   <- tiene que decir LOCAL
MSG
