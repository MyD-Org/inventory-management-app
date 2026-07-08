'use server';

// Server actions del módulo de presupuestos comerciales (cotizaciones a clientes).
// Mismo patrón que lib/budget-actions.ts: neon + auth() por acción, revalidatePath al mutar.

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';

const sql = neon(process.env.DATABASE_URL!);

export interface QuoteItemPayload {
    budget_id: number | null;
    label: string;
    reference?: string;
    description?: string;
    qty: number;
    unit_price: number;
    discount_pct: number; // descuento % por línea
    tax_pct: number;      // impuesto (IVA) % por línea
}

export interface QuotePayload {
    title: string;
    customer_name?: string;
    alegra_contact_id?: number | null;
    status: 'draft' | 'sent' | 'accepted' | 'rejected';
    notes?: string;
    items: QuoteItemPayload[];
}

function validQuotePayload(p: QuotePayload): string | null {
    if (!p.title?.trim()) return 'El título es requerido';
    if (!['draft', 'sent', 'accepted', 'rejected'].includes(p.status)) return 'Estado inválido';
    if (p.items.length === 0) return 'Agregá al menos un producto';
    for (const it of p.items) {
        if (!it.label?.trim() || !Number.isFinite(it.qty) || it.qty < 0 || !Number.isFinite(it.unit_price) || it.unit_price < 0) {
            return 'Hay ítems inválidos';
        }
        if (!Number.isFinite(it.discount_pct) || it.discount_pct < 0 || it.discount_pct > 100) return 'Descuento por línea inválido (0-100)';
        if (!Number.isFinite(it.tax_pct) || it.tax_pct < 0) return 'Impuesto por línea inválido';
    }
    return null;
}

// Crea (id null) o actualiza (id) un presupuesto completo. Los ítems se reemplazan
// (delete + insert), igual que en los cálculos de costo.
export async function saveQuote(id: number | null, payload: QuotePayload) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    const invalid = validQuotePayload(payload);
    if (invalid) return { error: invalid };

    const userName = session.user.name || session.user.email || 'Desconocido';

    try {
        let quoteId = id;
        if (quoteId == null) {
            const [row] = await sql`
                INSERT INTO quotes (title, customer_name, alegra_contact_id, status, discount_pct, notes, created_by)
                VALUES (${payload.title.trim()}, ${payload.customer_name || null}, ${payload.alegra_contact_id ?? null}, ${payload.status}, 0, ${payload.notes || null}, ${userName})
                RETURNING id
            `;
            quoteId = row.id as number;
        } else {
            const updated = await sql`
                UPDATE quotes
                SET title = ${payload.title.trim()}, customer_name = ${payload.customer_name || null},
                    alegra_contact_id = ${payload.alegra_contact_id ?? null},
                    status = ${payload.status}, notes = ${payload.notes || null}
                WHERE id = ${quoteId}
                RETURNING id
            `;
            if (updated.length === 0) return { error: 'Presupuesto no encontrado' };
            await sql`DELETE FROM quote_items WHERE quote_id = ${quoteId}`;
        }

        for (const it of payload.items) {
            await sql`
                INSERT INTO quote_items (quote_id, budget_id, label, reference, description, qty, unit_price, discount_pct, tax_pct)
                VALUES (${quoteId}, ${it.budget_id}, ${it.label.trim()}, ${it.reference?.trim() || null}, ${it.description?.trim() || null}, ${it.qty}, ${it.unit_price}, ${it.discount_pct}, ${it.tax_pct})
            `;
        }

        revalidatePath('/presupuestos');
        return { success: true, id: quoteId };
    } catch (error) {
        console.error('Error saving quote:', error);
        return { error: 'Error al guardar el presupuesto' };
    }
}

export async function deleteQuote(id: number) {
    const session = await auth();
    if (!session?.user) return { error: 'No autenticado' };

    try {
        await sql`DELETE FROM quotes WHERE id = ${id}`; // items caen por CASCADE
        revalidatePath('/presupuestos');
        return { success: true };
    } catch (error) {
        console.error('Error deleting quote:', error);
        return { error: 'Error al eliminar el presupuesto' };
    }
}
