import { neonConfig } from "@neondatabase/serverless"

// Desarrollo LOCAL sin Neon: el driver serverless habla SQL-sobre-HTTP (no el protocolo
// Postgres), así que un Postgres local pelado no alcanza. Con un proxy Neon local
// (ghcr.io/timowilhelm/local-neon-http-proxy apuntando al Postgres local) y esta env,
// todas las conexiones neon() del proceso pasan por el proxy:
//   NEON_LOCAL_PROXY=http://localhost:4444/sql
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/avantec
// En Vercel/prod la env no existe y este módulo no hace nada.
if (process.env.NEON_LOCAL_PROXY) {
  neonConfig.fetchEndpoint = process.env.NEON_LOCAL_PROXY
}
