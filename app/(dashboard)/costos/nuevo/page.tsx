import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import { redirect } from "next/navigation"
import { BudgetEditor } from "@/components/budget-editor"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { getDefaultMargin, getWorkHoursPerMonth } from "@/lib/budget-actions"
import { alegraEstimatesEnabled } from "@/lib/alegra"

export const dynamic = 'force-dynamic';

export default async function NewCostPage() {
    const session = await auth();
    if (!session?.user) redirect('/login')

    const [resources, defaultMargin, workHoursPerMonth] = await Promise.all([
        sql`SELECT id, name, role, monthly_value FROM labor_resources WHERE active = TRUE ORDER BY name ASC`,
        getDefaultMargin(),
        getWorkHoursPerMonth(),
    ])

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto px-4 py-6">
                <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
                        <Home className="w-3.5 h-3.5" />
                        Inicio
                    </Link>
                    <ChevronRight className="w-3.5 h-3.5" />
                    <Link href="/costos" className="hover:text-foreground transition-colors">
                        Costos
                    </Link>
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span className="text-foreground font-medium">Nuevo</span>
                </nav>

                <h1 className="text-2xl font-bold mb-6">Nuevo Cálculo de Costo</h1>
                <BudgetEditor
                    budget={null}
                    resources={resources.map(r => ({
                        id: r.id,
                        name: r.name,
                        role: r.role,
                        monthly_value: Number(r.monthly_value),
                    }))}
                    defaultMargin={defaultMargin}
                    workHoursPerMonth={workHoursPerMonth}
                    alegraEnabled={alegraEstimatesEnabled()}
                />
            </main>
        </div>
    )
}
