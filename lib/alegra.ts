// Cliente server-only de la API de Alegra (cotizaciones).
// Auth: HTTP Basic base64(email:token) — el token sale de Alegra → Integraciones/API.
// Base: https://api.alegra.com/api/v1 (REST + JSON, sin webhooks).
// Las credenciales viven SOLO en el server (.env): nunca llegan al navegador.

const ALEGRA_BASE = "https://api.alegra.com/api/v1"

export function isAlegraConfigured(): boolean {
    return Boolean(process.env.ALEGRA_EMAIL && process.env.ALEGRA_TOKEN)
}

// Crear cotizaciones por API requiere un plan de Alegra que incluya el módulo de ventas
// (hoy da 402). Se habilita explícitamente con ALEGRA_ESTIMATES_ENABLED=true cuando el plan
// lo soporte. El buscador de CONTACTOS no depende de esto (funciona con cualquier plan).
export function alegraEstimatesEnabled(): boolean {
    return isAlegraConfigured() && process.env.ALEGRA_ESTIMATES_ENABLED === "true"
}

function authHeader(): string {
    const raw = `${process.env.ALEGRA_EMAIL}:${process.env.ALEGRA_TOKEN}`
    return `Basic ${Buffer.from(raw).toString("base64")}`
}

export class AlegraError extends Error {
    constructor(public status: number, message: string) {
        super(message)
        this.name = "AlegraError"
    }
}

async function alegraFetch<T>(path: string, init?: RequestInit): Promise<T> {
    if (!isAlegraConfigured()) throw new AlegraError(503, "Alegra no está configurado (ALEGRA_EMAIL / ALEGRA_TOKEN)")
    const res = await fetch(`${ALEGRA_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: authHeader(),
            "Content-Type": "application/json",
            Accept: "application/json",
            ...init?.headers,
        },
        cache: "no-store",
    })
    if (!res.ok) {
        let detail = ""
        try {
            const body = await res.json()
            detail = body?.message ?? JSON.stringify(body)
        } catch { /* sin cuerpo */ }
        throw new AlegraError(res.status, `Alegra ${res.status}: ${detail || res.statusText}`)
    }
    return res.json() as Promise<T>
}

// ── Contactos (clientes) ─────────────────────────────────────────────────────

export interface AlegraContact {
    id: number
    name: string
    identification?: string | { number?: string } | null
    email?: string | null
}

export async function searchContacts(query: string): Promise<AlegraContact[]> {
    const q = encodeURIComponent(query.trim())
    const rows = await alegraFetch<AlegraContact[]>(`/contacts?query=${q}&limit=10&type=client`)
    return rows.map((c) => ({ id: Number(c.id), name: c.name, email: c.email ?? null }))
}

export async function createContact(name: string): Promise<AlegraContact> {
    const c = await alegraFetch<AlegraContact>(`/contacts`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), type: ["client"] }),
    })
    return { id: Number(c.id), name: c.name }
}

// ── Ítems (productos) ────────────────────────────────────────────────────────

export interface AlegraItem {
    id: number
    name: string
    price?: number
}

export async function searchItems(query: string): Promise<AlegraItem[]> {
    const q = encodeURIComponent(query.trim())
    const rows = await alegraFetch<Array<{ id: number; name: string }>>(`/items?query=${q}&limit=10`)
    return rows.map((i) => ({ id: Number(i.id), name: i.name }))
}

export async function createItem(name: string, price: number): Promise<number> {
    const item = await alegraFetch<{ id: number }>(`/items`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), price }),
    })
    return Number(item.id)
}

// Busca (o crea) el ítem genérico usado para líneas que no queremos dar de alta como
// producto propio en Alegra. El detalle real viaja en la descripción de la línea.
export const GENERIC_ITEM_NAME = "Trabajo de fabricación"

export async function ensureGenericItem(): Promise<number> {
    const q = encodeURIComponent(GENERIC_ITEM_NAME)
    const found = await alegraFetch<Array<{ id: number; name: string }>>(`/items?query=${q}&limit=10`)
    const exact = found.find((i) => i.name.trim().toLowerCase() === GENERIC_ITEM_NAME.toLowerCase())
    if (exact) return Number(exact.id)
    return createItem(GENERIC_ITEM_NAME, 0)
}

// ── Cotizaciones (estimates) ─────────────────────────────────────────────────

export interface EstimateLine {
    id: number          // alegra item id
    description?: string
    price: number
    quantity: number
    discount?: number   // % por línea
}

export interface CreatedEstimate {
    id: number
    number: string | null
    url: string
}

export async function createEstimate(args: {
    clientId: number
    lines: EstimateLine[]
    observations?: string
}): Promise<CreatedEstimate> {
    const today = new Date().toISOString().slice(0, 10)
    // Vigencia por defecto: 15 días (editable después en Alegra).
    const due = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().slice(0, 10)

    const est = await alegraFetch<{ id: number; number?: string | number; numberTemplate?: { number?: string | number } }>(`/estimates`, {
        method: "POST",
        body: JSON.stringify({
            client: args.clientId,
            date: today,
            dueDate: due,
            items: args.lines,
            ...(args.observations ? { observations: args.observations } : {}),
        }),
    })

    const number = est.numberTemplate?.number ?? est.number ?? null
    return {
        id: Number(est.id),
        number: number != null ? String(number) : null,
        url: `https://app.alegra.com/estimate/view/id/${est.id}`,
    }
}
