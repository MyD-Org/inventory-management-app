import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { SpecsManager, type SpecFieldRow } from "@/components/specs-manager"

export const dynamic = 'force-dynamic';

// Vocabulario que consume el agente del CRM por GET /api/specs. Editarlo acá es
// el punto del módulo: el bot descubre las opciones nuevas solo, sin tocar código.
export default async function SpecsPage() {
    const session = await auth()
    if (session?.user?.role !== 'admin') redirect('/')

    const rows = await sql`
        SELECT f.key, f.label, f.active AS field_active, f.position AS field_position,
               o.id AS option_id, o.value, o.label AS option_label, o.active AS option_active,
               o.position AS option_position
        FROM spec_fields f
        LEFT JOIN spec_options o ON o.field_key = f.key
        ORDER BY f.position ASC, f.key ASC, o.position ASC, o.value ASC
    `

    const byKey = new Map<string, SpecFieldRow>()
    for (const r of rows as any[]) {
        if (!byKey.has(r.key)) {
            byKey.set(r.key, { key: r.key, label: r.label, active: r.field_active, options: [] })
        }
        if (r.option_id) {
            byKey.get(r.key)!.options.push({
                id: r.option_id,
                value: r.value,
                label: r.option_label ?? r.value,
                active: r.option_active,
            })
        }
    }

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6 max-w-4xl">
                <h1 className="text-2xl font-bold mb-1">Opciones de Pedido</h1>
                <p className="text-sm text-muted-foreground mb-6">
                    El vocabulario que usa el asistente del CRM para tomar pedidos. Si una opción no
                    está acá, el asistente no la puede ofrecer. Los cambios los toma solo, sin necesidad
                    de tocar nada del lado del CRM.
                </p>
                <SpecsManager fields={Array.from(byKey.values())} />
            </main>
        </div>
    )
}
