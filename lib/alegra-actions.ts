'use server';

// Server actions de la integración con Alegra (crear la cotización desde un presupuesto).
// Flujo: el diálogo del editor busca/elige el contacto, muestra el estado de cada ítem
// (vinculado a un ítem de Alegra o no) y, según la decisión del usuario por ítem
// (crear en Alegra / mandar como genérico), arma el estimate.

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
    isAlegraConfigured,
    searchContacts,
    createContact,
    searchItems,
    createItem,
    ensureGenericItem,
    createEstimate,
    AlegraError,
    type EstimateLine,
} from '@/lib/alegra';

const sql = neon(process.env.DATABASE_URL!);

function errorMessage(error: unknown): string {
    if (error instanceof AlegraError) return error.message;
    return 'Error de conexión con Alegra';
}

export async function alegraConfigured(): Promise<boolean> {
    const session = await auth();
    if (!session?.user) return false;
    return isAlegraConfigured();
}

export async function searchAlegraContacts(query: string) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' as const, contacts: [] };
    if (!query.trim()) return { contacts: [] };

    try {
        const contacts = await searchContacts(query);
        return { contacts };
    } catch (error) {
        console.error('Error searching Alegra contacts:', error);
        return { error: errorMessage(error), contacts: [] };
    }
}

export async function searchAlegraItems(query: string) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' as const, items: [] };
    if (!query.trim()) return { items: [] };

    try {
        const items = await searchItems(query);
        return { items };
    } catch (error) {
        console.error('Error searching Alegra items:', error);
        return { error: errorMessage(error), items: [] };
    }
}

export async function createAlegraContact(name: string) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' as const };
    if (!name.trim()) return { error: 'El nombre es requerido' };

    try {
        const contact = await createContact(name);
        return { contact };
    } catch (error) {
        console.error('Error creating Alegra contact:', error);
        return { error: errorMessage(error) };
    }
}

// Estado de los ítems de un presupuesto respecto de Alegra, para armar el diálogo:
// - linked: el producto costeado ya tiene alegra_item_id (se reutiliza, sin preguntar)
// - unlinked: producto costeado sin vínculo → el usuario decide crear|generico
// - manual: ítem sin producto costeado → va como genérico siempre
export async function getQuoteAlegraStatus(quoteId: number) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' as const, items: [] };

    try {
        const items = await sql`
            SELECT qi.id, qi.label, qi.qty, qi.unit_price, qi.budget_id, b.alegra_item_id
            FROM quote_items qi
            LEFT JOIN budgets b ON b.id = qi.budget_id
            WHERE qi.quote_id = ${quoteId}
            ORDER BY qi.id ASC
        `;
        return {
            items: items.map((it) => ({
                id: it.id as number,
                label: it.label as string,
                qty: Number(it.qty),
                unitPrice: Number(it.unit_price),
                kind: (it.budget_id == null
                    ? 'manual'
                    : it.alegra_item_id != null
                        ? 'linked'
                        : 'unlinked') as 'manual' | 'linked' | 'unlinked',
            })),
        };
    } catch (error) {
        console.error('Error getting quote Alegra status:', error);
        return { error: 'Error al leer el presupuesto', items: [] };
    }
}

export interface AlegraSendDecision {
    itemId: number;                 // quote_items.id
    action: 'create' | 'generic';   // solo para ítems 'unlinked'
}

export async function sendQuoteToAlegra(
    quoteId: number,
    contactId: number,
    decisions: AlegraSendDecision[],
) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };
    if (!isAlegraConfigured()) return { error: 'Alegra no está configurado (ALEGRA_EMAIL / ALEGRA_TOKEN en .env)' };

    try {
        const [quote] = await sql`SELECT * FROM quotes WHERE id = ${quoteId}`;
        if (!quote) return { error: 'Presupuesto no encontrado' };
        if (quote.alegra_estimate_id) return { error: `Ya existe en Alegra (N° ${quote.alegra_estimate_number ?? quote.alegra_estimate_id})` };

        const items = await sql`
            SELECT qi.id, qi.label, qi.qty, qi.unit_price, qi.discount_pct, qi.budget_id, b.alegra_item_id
            FROM quote_items qi
            LEFT JOIN budgets b ON b.id = qi.budget_id
            WHERE qi.quote_id = ${quoteId}
            ORDER BY qi.id ASC
        `;
        if (items.length === 0) return { error: 'El presupuesto no tiene ítems' };

        const decisionOf = new Map(decisions.map((d) => [d.itemId, d.action]));
        let genericItemId: number | null = null;

        const lines: EstimateLine[] = [];
        for (const it of items) {
            const price = Number(it.unit_price);
            const qty = Number(it.qty);
            let alegraItemId: number;

            if (it.budget_id != null && it.alegra_item_id != null) {
                // Ya vinculado: se reutiliza (anti-duplicados).
                alegraItemId = Number(it.alegra_item_id);
            } else if (it.budget_id != null && decisionOf.get(it.id as number) === 'create') {
                // Crear el ítem en Alegra y guardar el vínculo en el producto costeado.
                alegraItemId = await createItem(it.label as string, price);
                await sql`UPDATE budgets SET alegra_item_id = ${alegraItemId} WHERE id = ${it.budget_id}`;
            } else {
                // Genérico (ítems manuales o decisión 'generic'): detalle en la descripción.
                if (genericItemId == null) genericItemId = await ensureGenericItem();
                alegraItemId = genericItemId;
            }

            const lineDiscount = Number(it.discount_pct) || 0;
            lines.push({
                id: alegraItemId,
                description: it.label as string,
                price,
                quantity: qty,
                ...(lineDiscount > 0 ? { discount: lineDiscount } : {}),
            });
        }

        const estimate = await createEstimate({
            clientId: contactId,
            lines,
            observations: (quote.notes as string) || undefined,
        });

        await sql`
            UPDATE quotes
            SET alegra_estimate_id = ${estimate.id},
                alegra_estimate_number = ${estimate.number},
                alegra_contact_id = ${contactId},
                status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END
            WHERE id = ${quoteId}
        `;
        revalidatePath('/presupuestos');
        revalidatePath(`/presupuestos/${quoteId}`);

        return { success: true, id: estimate.id, number: estimate.number, url: estimate.url };
    } catch (error) {
        console.error('Error sending quote to Alegra:', error);
        return { error: errorMessage(error) };
    }
}
