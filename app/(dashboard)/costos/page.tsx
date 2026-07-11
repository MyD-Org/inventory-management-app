import Link from "next/link"
import { redirect } from "next/navigation"
import { BudgetsTable, type BudgetRow } from "@/components/budgets-table"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { auth } from "@/auth"
import { sql } from "@/lib/database"

export const dynamic = 'force-dynamic';

export default async function CostsPage() {
    const session = await auth();
    if (!session?.user) redirect('/login')

    // Costo total derivado de las líneas (materiales + mano de obra + extras).
    const rows = await sql`
        SELECT
            b.id, b.name, b.status, b.margin_pct, b.created_by, b.created_at,
            COALESCE(m.total, 0) + COALESCE(l.total, 0) + COALESCE(e.total, 0) AS cost
        FROM budgets b
        LEFT JOIN (SELECT budget_id, SUM(qty * unit_cost) AS total FROM budget_materials GROUP BY budget_id) m ON m.budget_id = b.id
        LEFT JOIN (SELECT budget_id, SUM(hours * hourly_rate) AS total FROM budget_labor GROUP BY budget_id) l ON l.budget_id = b.id
        LEFT JOIN (SELECT budget_id, SUM(amount) AS total FROM budget_extras GROUP BY budget_id) e ON e.budget_id = b.id
        ORDER BY b.created_at DESC
    `

    const budgets: BudgetRow[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        margin_pct: Number(r.margin_pct),
        cost: Number(r.cost),
        created_by: r.created_by,
        created_at: r.created_at,
    }))

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Costos de Fabricación</h1>
                        <p className="text-sm text-muted-foreground">
                            Costo real de producción a partir del inventario, mano de obra y otros costos
                        </p>
                    </div>
                    <Link href="/costos/nuevo">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nuevo Cálculo
                        </Button>
                    </Link>
                </div>
                <BudgetsTable budgets={budgets} />
            </main>
        </div>
    )
}
