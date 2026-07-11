import { LaborResourcesTable } from "@/components/labor-resources-table"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { redirect } from "next/navigation"
import { getWorkHoursPerMonth } from "@/lib/budget-actions"

export const dynamic = 'force-dynamic';

export default async function LaborResourcesPage() {
    const session = await auth();

    if (session?.user?.role !== 'admin') {
        redirect('/')
    }

    const [resources, workHoursPerMonth] = await Promise.all([
        sql`SELECT * FROM labor_resources ORDER BY active DESC, name ASC`,
        getWorkHoursPerMonth(),
    ])

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="max-w-5xl mx-auto">
                    <h1 className="text-2xl font-bold mb-1">Recursos de Mano de Obra</h1>
                    <p className="text-sm text-muted-foreground mb-6">
                        Empleados propios, contratistas, talleres externos, instaladores o servicios tercerizados.
                        El valor por mes se convierte a costo por hora para los cálculos de costos.
                    </p>
                    <LaborResourcesTable
                        resources={resources.map(r => ({
                            id: r.id,
                            name: r.name,
                            role: r.role,
                            monthly_value: Number(r.monthly_value),
                            active: r.active,
                        }))}
                        workHoursPerMonth={workHoursPerMonth}
                    />
                </div>
            </main>
        </div>
    )
}
