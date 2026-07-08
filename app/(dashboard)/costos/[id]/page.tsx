import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import { notFound, redirect } from "next/navigation"
import { BudgetEditor, type BudgetEditorData } from "@/components/budget-editor"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { getDefaultMargin, getWorkHoursPerMonth } from "@/lib/budget-actions"
import { alegraEstimatesEnabled } from "@/lib/alegra"

export const dynamic = 'force-dynamic';

export default async function EditCostPage({ params }: { params: { id: string } }) {
    const session = await auth();
    if (!session?.user) redirect('/login')

    const budgetId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(budgetId)) notFound()

    const [budgetRows, materials, labor, extras, resources, defaultMargin, workHoursPerMonth] = await Promise.all([
        sql`SELECT * FROM budgets WHERE id = ${budgetId}`,
        sql`SELECT * FROM budget_materials WHERE budget_id = ${budgetId} ORDER BY id ASC`,
        sql`SELECT * FROM budget_labor WHERE budget_id = ${budgetId} ORDER BY id ASC`,
        sql`SELECT * FROM budget_extras WHERE budget_id = ${budgetId} ORDER BY id ASC`,
        sql`SELECT id, name, role, monthly_value FROM labor_resources WHERE active = TRUE ORDER BY name ASC`,
        getDefaultMargin(),
        getWorkHoursPerMonth(),
    ])

    const row = budgetRows[0]
    if (!row) notFound()

    // Fecha en que se calculó (created_at), formateada en zona horaria de Argentina.
    const calcDate = new Date(row.created_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "America/Argentina/Buenos_Aires",
    })

    const budget: BudgetEditorData = {
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        status: row.status,
        marginPct: Number(row.margin_pct),
        materials: materials.map((m) => ({
            materialId: m.material_id,
            label: m.label,
            qty: Number(m.qty),
            unitCost: Number(m.unit_cost),
        })),
        labor: labor.map((l) => ({
            resourceId: l.resource_id,
            label: l.label,
            hours: Number(l.hours),
            hourlyRate: Number(l.hourly_rate),
        })),
        extras: extras.map((e) => ({
            label: e.label,
            amount: Number(e.amount),
        })),
        alegraItemId: row.alegra_item_id ?? null,
    }

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
                    <span className="text-foreground font-medium truncate max-w-[50vw]">{row.name}</span>
                </nav>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold">Editar Cálculo de Costo</h1>
                    <p className="text-sm text-muted-foreground">Calculado el {calcDate}</p>
                </div>
                <BudgetEditor
                    budget={budget}
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
