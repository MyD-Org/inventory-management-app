import { notFound, redirect } from "next/navigation"
import { QuoteEditor, type QuoteEditorData } from "@/components/quote-editor"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { getCostedProducts } from "@/lib/costed-products"
import { isAlegraConfigured, alegraEstimatesEnabled } from "@/lib/alegra"

export const dynamic = 'force-dynamic';

export default async function EditQuotePage({ params }: { params: { id: string } }) {
    const session = await auth();
    if (!session?.user) redirect('/login')

    const quoteId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(quoteId)) notFound()

    const [quoteRows, itemRows, products] = await Promise.all([
        sql`SELECT * FROM quotes WHERE id = ${quoteId}`,
        sql`SELECT * FROM quote_items WHERE quote_id = ${quoteId} ORDER BY id ASC`,
        getCostedProducts(),
    ])

    const row = quoteRows[0]
    if (!row) notFound()

    const quote: QuoteEditorData = {
        id: row.id,
        title: row.title,
        customerName: row.customer_name ?? "",
        status: row.status,
        notes: row.notes ?? "",
        items: itemRows.map((it) => ({
            budgetId: it.budget_id,
            label: it.label,
            reference: it.reference ?? "",
            description: it.description ?? "",
            qty: Number(it.qty),
            unitPrice: Number(it.unit_price),
            discountPct: Number(it.discount_pct),
            taxPct: Number(it.tax_pct),
        })),
        alegraEstimateId: row.alegra_estimate_id ?? null,
        alegraEstimateNumber: row.alegra_estimate_number ?? null,
        alegraContactId: row.alegra_contact_id ?? null,
    }

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6">
                <QuoteEditor
                    quote={quote}
                    products={products}
                    heading="Editar Presupuesto"
                    alegraEnabled={isAlegraConfigured()}
                    alegraEstimatesEnabled={alegraEstimatesEnabled()}
                />
            </main>
        </div>
    )
}
