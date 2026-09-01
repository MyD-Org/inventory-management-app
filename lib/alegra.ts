// Cliente server-only de la API de Alegra (cotizaciones).
// Auth: HTTP Basic base64(email:token) — el token sale de Alegra → Integraciones/API.
// Base: https://api.alegra.com/api/v1 (REST + JSON, sin webhooks).
// Las credenciales viven SOLO en el server (.env): nunca llegan al navegador.

const ALEGRA_BASE = "https://api.alegra.com/api/v1"

// Hay credenciales: alcanza para todo lo de LECTURA (buscar contactos y
// productos). Es la bandera que gatea los autocompletados, tanto el de clientes
// en presupuestos como el del nombre del producto en costos.
export function isAlegraConfigured(): boolean {
    return Boolean(process.env.ALEGRA_EMAIL && process.env.ALEGRA_TOKEN)
}

// Crear cotizaciones por API requiere un plan de Alegra que incluya el módulo de ventas
// (hoy da 402). Se habilita explícitamente con ALEGRA_ESTIMATES_ENABLED=true cuando el plan
// lo soporte.
//
// SOLO para ESCRITURA. Ningún buscador debe depender de esta bandera: emitir un
// documento en la contabilidad y leer un catálogo son permisos distintos, y
// mezclarlos obliga a habilitar la emisión para poder autocompletar un nombre.
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

// Trae TODOS los contactos, paginando. El espejo (alegra_clients) se llenaba con
// exports CSV a mano, lo que lo dejaba meses atrasado: sirve para reemplazar eso.
// La API pagina con start/limit; 30 es el máximo que devuelve por página.
export interface AlegraContactFull {
    id: number
    name: string
    identification: string | null
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    status: string | null
}

// El rate limit de contactos es 100/min y se llega fácil: cada sync son varias
// páginas, y dos corridas seguidas ya devuelven 429. Reintenta respetando el
// x-rate-limit-reset que manda Alegra en vez de abandonar el sync a la mitad.
async function fetchPageWithRetry(path: string, attempt = 0): Promise<any[]> {
    try {
        return await alegraFetch<any[]>(path)
    } catch (error) {
        // Solo 429. Un 402 (plan) o un 401 (credenciales) no mejoran esperando.
        if (!(error instanceof AlegraError) || error.status !== 429 || attempt >= 3) throw error
        // La ventana del rate limit es de un minuto; 15s, 30s, 45s cubre el peor
        // caso sin dejar el cron colgado más de lo razonable.
        await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)))
        return fetchPageWithRetry(path, attempt + 1)
    }
}

export async function listAllContacts(): Promise<AlegraContactFull[]> {
    const PAGE = 30
    const out: AlegraContactFull[] = []
    // Tope defensivo: si la API dejara de respetar 'start' esto no dispara un
    // bucle infinito contra un servicio con rate limit de 100/min.
    for (let start = 0; start < 5000; start += PAGE) {
        const rows = await fetchPageWithRetry(`/contacts?limit=${PAGE}&start=${start}`)
        for (const c of rows) {
            out.push({
                id: Number(c.id),
                name: String(c.name ?? "").trim(),
                identification: c.identification ?? null,
                email: c.email ?? null,
                // Alegra guarda hasta tres teléfonos; el bot identifica al cliente
                // por el suyo, así que preferimos el principal y caemos al móvil.
                phone: c.phonePrimary || c.mobile || c.phoneSecondary || null,
                address: c.address?.address ?? null,
                city: c.address?.city ?? null,
                status: c.status ?? null,
            })
        }
        if (rows.length < PAGE) break
    }
    return out
}

// Documentos de venta y pagos, para el espejo. Se filtran por fecha
// (date_afterOrNow) para que el sync incremental no tenga que traer los 2600
// documentos históricos en cada corrida.
export async function listInvoicesSince(since: string, maxPages = 120): Promise<any[]> {
    const PAGE = 30
    const out: any[] = []
    for (let page = 0; page < maxPages; page++) {
        const rows = await fetchPageWithRetry(
            `/invoices?limit=${PAGE}&start=${page * PAGE}&date_afterOrNow=${since}&order_field=date&order_direction=ASC`,
        )
        out.push(...rows)
        if (rows.length < PAGE) break
    }
    return out
}

export async function listPaymentsSince(since: string, maxPages = 120): Promise<any[]> {
    const PAGE = 30
    const out: any[] = []
    for (let page = 0; page < maxPages; page++) {
        const rows = await fetchPageWithRetry(
            `/payments?limit=${PAGE}&start=${page * PAGE}&date_afterOrNow=${since}`,
        )
        out.push(...rows)
        if (rows.length < PAGE) break
    }
    return out
}

// Todos los productos, para el espejo. Sin filtro: el catálogo es de ~1700 ítems
// (57 páginas), y no hay forma de pedir "los modificados desde tal fecha".
export async function listAllItems(maxPages = 120): Promise<any[]> {
    const PAGE = 30
    const out: any[] = []
    for (let page = 0; page < maxPages; page++) {
        const rows = await fetchPageWithRetry(`/items?limit=${PAGE}&start=${page * PAGE}`)
        out.push(...rows)
        if (rows.length < PAGE) break
    }
    return out
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
//
// Es el último recurso: se usa cuando no se encontró ni el producto con su color ni
// el producto base. "Equipo especial" y no "Trabajo de fabricación" porque es lo que
// realmente es desde el lado del cliente que lee la factura.
export const GENERIC_ITEM_NAME = "Equipo especial"

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

// ── Numeraciones de facturación ──────────────────────────────────────────────

export interface NumberTemplate {
    id: number
    name: string
    fullNumber?: string | null
}

export async function listNumberTemplates(): Promise<NumberTemplate[]> {
    try {
        const data = await alegraFetch<unknown>("/number-templates")
        // Alegra devuelve un array directo; si algún día envuelve, tomamos data.
        const rows = Array.isArray(data) ? data : (data as any)?.data
        if (!Array.isArray(rows)) return []
        return rows.map((r) => ({
            id: Number(r.id),
            name: String(r.name ?? ""),
            fullNumber: r.fullNumber != null ? String(r.fullNumber) : null,
        }))
    } catch {
        return []
    }
}

// ── Facturas ─────────────────────────────────────────────────────────────────

export interface CreatedInvoice {
    id: number
    number: string | null
    url: string
}

// ── Remitos ──────────────────────────────────────────────────────────────────

export interface CreatedRemission {
    id: number
    number: string | null
    url: string
}

// Emite un remito. ESCRIBE en la contabilidad real, igual que createInvoice.
//
// SIN NUMERACIÓN EXPLÍCITA: a diferencia de las facturas, acá no se manda
// numberTemplate. Los remitos de la cuenta se numeran solos y meterse a elegir la
// numeración sería inventar una decisión que nadie tomó.
//
// LAS LÍNEAS VAN EN CERO y eso lo decide quien llama, no esta función: acá se
// manda lo que venga. Ver lib/remissions.ts para el porqué.
export async function createRemission(args: {
    clientId: number
    lines: EstimateLine[]
    observations?: string
}): Promise<CreatedRemission> {
    const today = new Date().toISOString().slice(0, 10)

    const body: Record<string, unknown> = {
        documentName: "remission",
        client: args.clientId,
        date: today,
        // Alegra la exige. Un remito no vence: se manda la misma fecha para no
        // inventar un plazo que el taller no maneja.
        dueDate: today,
        items: args.lines,
    }
    if (args.observations) body.observations = args.observations

    const rem = await alegraFetch<{ id: number; number?: string | number; numberTemplate?: { fullNumber?: string; number?: string | number } }>(
        `/remissions`,
        { method: "POST", body: JSON.stringify(body) },
    )

    const number = rem.numberTemplate?.fullNumber ?? rem.numberTemplate?.number ?? rem.number ?? null
    return {
        id: Number(rem.id),
        number: number != null ? String(number) : null,
        url: `https://app.alegra.com/remission/view/id/${rem.id}`,
    }
}

// Reescribe las líneas de una factura YA EMITIDA. Se usa cuando el pedido cambió
// después de facturar: en vez de emitir una segunda factura, se corrige la que hay.
//
// SE MANDA EL ARRAY COMPLETO de líneas, no un delta: Alegra reemplaza los ítems por
// lo que reciba. Y no fusiona repetidos —el mismo ítem dos veces quedan dos
// renglones—, que es justo lo que hace falta para las variantes de un producto.
//
// PUEDE FALLAR POR MOTIVOS DE NEGOCIO, no solo de formato: si el ítem no tiene
// stock suficiente, Alegra responde 400 "Se ha excedido la cantidad disponible".
// Y una factura ya timbrada electrónicamente no se puede modificar —hoy esta cuenta
// no timbra, pero el día que lo haga esto empieza a devolver error, no a romperse
// en silencio. Quien llame tiene que estar preparado para el AlegraError.
export async function updateInvoice(
    invoiceId: number,
    args: { lines: EstimateLine[]; terms?: string | null; invoiceNotes?: string | null },
): Promise<CreatedInvoice> {
    const body: Record<string, unknown> = { items: args.lines }
    // null borra el campo en Alegra; undefined lo deja como estaba.
    if (args.terms !== undefined) body.paymentTerms = args.terms
    if (args.invoiceNotes !== undefined) body.invoiceNotes = args.invoiceNotes

    const inv = await alegraFetch<{ id: number; numberTemplate?: { fullNumber?: string; number?: string | number } }>(
        `/invoices/${invoiceId}`,
        { method: "PUT", body: JSON.stringify(body) },
    )

    const number = inv.numberTemplate?.fullNumber ?? inv.numberTemplate?.number ?? null
    return {
        id: Number(inv.id),
        number: number != null ? String(number) : null,
        url: `https://app.alegra.com/invoice/view/id/${inv.id}`,
    }
}

// Emite una factura. ESCRIBE en la contabilidad real: todo lo que la llama tiene
// que poder correrse antes en modo simulación (ver lib/invoicing.ts).
export async function createInvoice(args: {
    clientId: number
    lines: EstimateLine[]
    observations?: string
    numberTemplateId?: number
    terms?: string | null
    invoiceNotes?: string | null
}): Promise<CreatedInvoice> {
    const today = new Date().toISOString().slice(0, 10)

    const body: Record<string, unknown> = {
        client: args.clientId,
        date: today,
        dueDate: today,
        items: args.lines,
    }
    if (args.observations) body.observations = args.observations
    if (args.numberTemplateId != null) body.numberTemplate = { id: args.numberTemplateId }
    if (args.terms) body.paymentTerms = args.terms
    if (args.invoiceNotes) body.invoiceNotes = args.invoiceNotes

    const inv = await alegraFetch<{ id: number; numberTemplate?: { fullNumber?: string; number?: string | number } }>(`/invoices`, {
        method: "POST",
        body: JSON.stringify(body),
    })

    const number = inv.numberTemplate?.fullNumber ?? inv.numberTemplate?.number ?? null
    return {
        id: Number(inv.id),
        number: number != null ? String(number) : null,
        url: `https://app.alegra.com/invoice/view/id/${inv.id}`,
    }
}
