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
NETWORK=avantec-local
DB=avantec
PROXY_URL=http://localhost:4444/sql
# 5433 Y NO 5432: es habitual tener un Postgres instalado en la Mac ocupando el
# 5432, y ahí el contenedor no puede publicar el puerto —o lo publica en otra
# interfaz y convivís con dos bases creyendo que es una—. Este puerto es solo
# para poder abrir psql desde la Mac; el proxy NO lo usa (ver más abajo).
PG_PORT=5433
LOCAL_URL="postgres://postgres:postgres@localhost:$PG_PORT/$DB"

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

# ---------- 2. Una red propia para los dos contenedores ----------
# Así el proxy llega al Postgres POR NOMBRE, sin pasar por ningún puerto de la
# Mac. Con host.docker.internal el proxy termina en lo que sea que esté
# escuchando en el 5432 de la máquina, que puede ser otro Postgres: entonces la
# migración se aplica en un lado y la app lee del otro.
docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
echo "✅ Red $NETWORK"

# ---------- 2b. Postgres ----------
if docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    docker start "$PG_CONTAINER" >/dev/null
    # Un contenedor de antes de la red se adopta en vez de recrearse: recrearlo
    # borraría la base. Conectarlo no toca los datos.
    docker network connect "$NETWORK" "$PG_CONTAINER" 2>/dev/null \
        && echo "✅ Postgres ya existía, conectado a $NETWORK" \
        || echo "✅ Postgres ya existía, arrancado"
else
    docker run -d --name "$PG_CONTAINER" --network "$NETWORK" \
        -e POSTGRES_PASSWORD=postgres -p "$PG_PORT":5432 postgres:16-alpine >/dev/null
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
# EL PROXY VIEJO SE RECREA, no se adopta: PG_CONNECTION_STRING se fija al crear
# el contenedor y no se puede cambiar. Uno hecho contra host.docker.internal
# sigue apuntando al Postgres de la Mac por más que esté en la red. Como no
# guarda nada, recrearlo no cuesta nada.
apunta_al_contenedor=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' \
    "$PROXY_CONTAINER" 2>/dev/null | grep -c "@$PG_CONTAINER:" || true)
if [ "${apunta_al_contenedor:-0}" -eq 0 ] \
   && docker ps -a --format '{{.Names}}' | grep -qx "$PROXY_CONTAINER"; then
    docker rm -f "$PROXY_CONTAINER" >/dev/null
    echo "   proxy viejo (apuntaba al Postgres de la Mac) eliminado"
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$PROXY_CONTAINER"; then
    docker start "$PROXY_CONTAINER" >/dev/null
    echo "✅ Proxy de Neon ya existía, arrancado"
else
    docker run -d --name "$PROXY_CONTAINER" --network "$NETWORK" -p 4444:4444 \
        -e PG_CONNECTION_STRING="postgres://postgres:postgres@$PG_CONTAINER:5432/$DB" \
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

Y para abrir psql desde la Mac, el contenedor publica el $PG_PORT (no el 5432,
que suele estar tomado por un Postgres instalado a mano):

  psql postgres://postgres:postgres@localhost:$PG_PORT/$DB
MSG
