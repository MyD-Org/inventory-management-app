import Link from "next/link"
import { redirect } from "next/navigation"
import { QuotesTable, type QuoteRow } from "@/components/quotes-table"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { auth } from "@/auth"
import { sql } from "@/lib/database"

export const dynamic = 'force-dynamic';

export default async function QuotesPage() {
    const session = await auth();
    if (!session?.user) redirect('/login')

    // Total = suma por línea con descuento e impuesto aplicados (qty * precio * (1-desc%) * (1+imp%)).
    const rows = await sql`
        SELECT
            q.id, q.title, q.customer_name, q.status, q.created_by, q.created_at,
            q.alegra_estimate_number,
            COALESCE(i.total, 0) AS total
        FROM quotes q
        LEFT JOIN (
            SELECT quote_id,
                   SUM(qty * unit_price * (1 - discount_pct / 100) * (1 + tax_pct / 100)) AS total
            FROM quote_items
            GROUP BY quote_id
        ) i ON i.quote_id = q.id
        ORDER BY q.created_at DESC
    `

    const quotes: QuoteRow[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        customer_name: r.customer_name,
        status: r.status,
        total: Number(r.total),
        created_by: r.created_by,
        created_at: r.created_at,
        alegra_estimate_number: r.alegra_estimate_number,
    }))

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Presupuestos</h1>
                        <p className="text-sm text-muted-foreground">
                            Cotizaciones para clientes a partir de los costos de fabricación
                        </p>
                    </div>
                    <Link href="/presupuestos/nuevo">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nuevo Presupuesto
                        </Button>
                    </Link>
                </div>
                <QuotesTable quotes={quotes} />
            </main>
        </div>
    )
}
