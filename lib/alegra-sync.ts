import { sql } from "@/lib/database"
import { listAllContacts } from "@/lib/alegra"

// Sync del espejo de Alegra contra la API.
//
// Hasta ahora alegra_clients se llenaba con exports CSV cargados a mano
// (lib/alegra-import.ts). El resultado medido el 2026-08-24: 42 clientes
// espejados contra 110 en Alegra, y un mes de atraso en las facturas. Como
// searchCustomers() y las tools de IA leen del espejo, dos de cada tres clientes
// no aparecían al cargar un pedido.
//
// El espejo NO se elimina a favor de consultar Alegra en vivo, a propósito:
//   - Los reportes agregan sobre miles de documentos; por la API, que pagina de
//     a 30 y tarda ~1s por request, un solo reporte serían minutos y volaría el
//     rate limit (100/min en contactos, 150/min en el resto).
//   - Durante un mes /items devolvió 402 por el plan de la cuenta. Con todo en
//     vivo la app habría estado rota; el espejo la mantuvo funcionando.
// Lo que cambia es cómo se llena: API en vez de CSV.

export interface SyncResult {
    fetched: number
    inserted: number
    updated: number
    skipped: number
    /**
     * Contactos que comparten nombre con otro ya espejado. El espejo tiene
     * name_normalized UNIQUE (de cuando el CSV solo traía el nombre), así que no
     * puede representar dos clientes que se llamen igual. Se conserva el primero
     * y se listan acá los otros, en vez de pisar un alegra_id sin avisar: son
     * duplicados en Alegra que conviene unificar allá.
     */
    duplicates: Array<{ alegra_id: number; name: string; kept_alegra_id: number | null }>
}

function normalizeName(s: string | undefined): string {
    return (s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

// Trae los contactos de Alegra y los vuelca en alegra_clients.
//
// El match es en dos pasos porque las filas tienen dos orígenes posibles: las
// que vinieron por API tienen alegra_id, y las que vinieron del CSV solo tienen
// el nombre. Primero se busca por alegra_id (sobrevive a que renombren al
// cliente en Alegra) y recién si no aparece se cae al nombre normalizado, que es
// lo que adopta las filas viejas del CSV en vez de duplicarlas.
//
// NO borra nada: un cliente que ya no esté en Alegra queda en el espejo, porque
// puede tener facturas históricas que lo referencian.
export async function syncContacts(): Promise<SyncResult> {
    const contacts = await listAllContacts()
    const result: SyncResult = { fetched: contacts.length, inserted: 0, updated: 0, skipped: 0, duplicates: [] }

    for (const c of contacts) {
        const norm = normalizeName(c.name)
        if (!norm) {
            result.skipped++
            continue
        }

        const byId = await sql`
            UPDATE alegra_clients SET
                name = ${c.name},
                name_normalized = ${norm},
                identification = COALESCE(${c.identification}, identification),
                email = COALESCE(${c.email}, email),
                phone = COALESCE(${c.phone}, phone),
                address = COALESCE(${c.address}, address),
                city = COALESCE(${c.city}, city),
                updated_at = NOW()
            WHERE alegra_id = ${c.id}
            RETURNING id
        `
        if (byId.length > 0) {
            result.updated++
            continue
        }

        // Sin alegra_id: o es nuevo, o es una fila del CSV que hay que adoptar,
        // o hay otro contacto de Alegra que se llama igual. Ese último caso no lo
        // puede representar el espejo, así que se reporta y no se toca la fila.
        const [existing] = await sql`
            SELECT alegra_id FROM alegra_clients WHERE name_normalized = ${norm}
        `
        if (existing && existing.alegra_id != null && Number(existing.alegra_id) !== c.id) {
            result.duplicates.push({ alegra_id: c.id, name: c.name, kept_alegra_id: Number(existing.alegra_id) })
            continue
        }

        // COALESCE en el UPDATE para no pisar con NULL lo que el CSV ya tenía.
        const upsert = await sql`
            INSERT INTO alegra_clients (alegra_id, name, name_normalized, identification, email, phone, address, city)
            VALUES (${c.id}, ${c.name}, ${norm}, ${c.identification}, ${c.email}, ${c.phone}, ${c.address}, ${c.city})
            ON CONFLICT (name_normalized) DO UPDATE SET
                alegra_id = EXCLUDED.alegra_id,
                identification = COALESCE(EXCLUDED.identification, alegra_clients.identification),
                email = COALESCE(EXCLUDED.email, alegra_clients.email),
                phone = COALESCE(EXCLUDED.phone, alegra_clients.phone),
                address = COALESCE(EXCLUDED.address, alegra_clients.address),
                city = COALESCE(EXCLUDED.city, alegra_clients.city),
                updated_at = NOW()
            RETURNING (xmax = 0) AS is_insert
        `
        if (upsert[0]?.is_insert) result.inserted++
        else result.updated++
    }

    return result
}
