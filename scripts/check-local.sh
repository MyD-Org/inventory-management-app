#!/usr/bin/env bash
# Diagnóstico del entorno local. NO escribe nada: mira y cuenta.
#
# Para cuando la app tira un error de base y no está claro contra qué está
# hablando. Imprime, en orden, los cuatro eslabones de la cadena:
#
#   .env.local  ->  proxy  ->  Postgres  ->  schema
#
# El primero que falle es el que hay que arreglar; los de abajo van a fallar en
# consecuencia. Las contraseñas salen tapadas: esta salida se pega en un chat.
#
#   bash scripts/check-local.sh
set -uo pipefail

PROXY_URL=${NEON_LOCAL_PROXY:-http://localhost:4444/sql}
ok()   { echo "✅ $1"; }
bad()  { echo "❌ $1"; }
info() { echo "   $1"; }

echo "── 1. .env.local ──────────────────────────────"
if [ ! -f .env.local ]; then
    bad "No existe .env.local"
else
    # Se muestran las líneas que importan, con la contraseña tapada.
    grep -nE '^\s*#?\s*(DATABASE_URL|NEON_LOCAL_PROXY)' .env.local \
        | sed -E 's#://[^:]+:[^@]+@#://<usuario>:<clave>@#g'
    activas=$(grep -cE '^\s*DATABASE_URL=' .env.local || true)
    [ "$activas" -eq 1 ] && ok "una sola DATABASE_URL activa" || bad "$activas líneas DATABASE_URL activas (tiene que haber 1)"
    if grep -qE '^\s*DATABASE_URL=.*(neon\.tech|neondb_owner)' .env.local; then
        bad "DATABASE_URL apunta a Neon: la app va a PRODUCCIÓN"
    else
        ok "DATABASE_URL no apunta a Neon"
    fi
    grep -qE '^\s*NEON_LOCAL_PROXY=' .env.local && ok "NEON_LOCAL_PROXY presente" || bad "falta NEON_LOCAL_PROXY"
fi

echo
echo "── 2. Contenedores ────────────────────────────"
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
    for c in ai-api-pg neon-proxy; do
        estado=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo "no existe")
        [ "$estado" = "running" ] && ok "$c: corriendo" || bad "$c: $estado"
    done
else
    bad "Docker no responde (¿está abierto Docker Desktop?)"
fi

echo
echo "── 3. El proxy contesta ───────────────────────"
# EL PROXY NECESITA EL HEADER neon-connection-string: es de ahí de donde saca a
# qué base conectarse y con qué usuario —no de su propia configuración—. Por eso
# una DATABASE_URL con las credenciales de Neon apuntada al Postgres local falla
# con "password authentication failed for user neondb_owner": el proxy pasa esas
# credenciales tal cual. Sin el header contesta "invalid header", que parece un
# proxy roto y no lo es.
conn=$(grep -E '^\s*DATABASE_URL=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'"')
respuesta=$(curl -s -m 5 -X POST "$PROXY_URL" -H 'content-type: application/json' \
    -H "neon-connection-string: $conn" \
    -d '{"query":"select current_user, current_database()","params":[]}' 2>&1)
if echo "$respuesta" | grep -q '"rows"'; then
    ok "$PROXY_URL responde"
    info "$(echo "$respuesta" | sed -E 's/.*"rows":(\[[^]]*\]).*/\1/')"
else
    bad "$PROXY_URL no responde una consulta"
    info "$(echo "$respuesta" | head -c 200)"
fi

echo
echo "── 4. El schema ───────────────────────────────"
tabla=$(docker exec ai-api-pg psql -U postgres -tAd avantec -c \
    "SELECT count(*) FROM information_schema.columns WHERE table_name='order_items' AND column_name='delivered_quantity'" 2>&1)
if [ "$tabla" = "1" ]; then
    ok "order_items.delivered_quantity existe (migración 41 aplicada)"
elif [ "$tabla" = "0" ]; then
    bad "falta la migración 41: correr bash scripts/setup-local.sh"
else
    bad "no se pudo consultar la base"
    info "$(echo "$tabla" | head -c 200)"
fi
