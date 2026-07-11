import { neon } from "@neondatabase/serverless"

// Conexión para las queries de dashboards. En prod apuntar DASHBOARDS_DATABASE_URL a un
// rol READ-ONLY de Neon (defensa principal); mientras tanto cae a DATABASE_URL.
const url = process.env.DASHBOARDS_DATABASE_URL || process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL environment variable is not set")
export const dashboardsSql = neon(url)

export const MAX_ROWS = 10000

export interface DashboardRow {
  id: number
  name: string
  document: unknown
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Defensa en profundidad sobre el SQL generado por el agente (además del rol RO):
 * - ignora líneas de comentario `--` iniciales (el agente arranca con un marcador)
 * - el statement debe empezar con SELECT o WITH
 * - un solo statement (sin `;` intermedios; se tolera uno final)
 * Lanza Error con mensaje legible si no valida.
 */
export function assertSelectOnly(source: string): string {
  const trimmed = source.trim().replace(/;\s*$/, "")
  if (trimmed.includes(";")) {
    throw new Error("Solo se permite un statement (sin ';' intermedios)")
  }
  const withoutComments = trimmed
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim()
  if (!/^(select|with)\b/i.test(withoutComments)) {
    throw new Error("Solo se permiten consultas SELECT")
  }
  return trimmed
}

/** Fuerza un tope de filas si la query no trae LIMIT propio al final. */
export function withLimit(source: string, max = MAX_ROWS): string {
  if (/limit\s+\d+\s*$/i.test(source)) return source
  return `${source}\nLIMIT ${max}`
}
