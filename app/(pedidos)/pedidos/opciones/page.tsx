import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { ChevronRight } from "lucide-react"
import { SpecsManager, type SpecFieldRow } from "@/components/specs-manager"
import { CustomerStatusMap } from "@/components/customer-status-map"
import { getCustomerStatusMap } from "@/lib/orders"

export const dynamic = 'force-dynamic';

// Vocabulario que consume el agente del CRM por GET /api/specs. Editarlo acá es
// el punto del módulo: el bot descubre las opciones nuevas solo.
export default async function SpecsPage() {
    const session = await auth()
    if (session?.user?.role !== 'admin') redirect('/pedidos')

    const statusMap = await getCustomerStatusMap()

    const rows = await sql`
        SELECT f.key, f.label, f.free_text, f.active AS field_active,
               o.id AS option_id, o.value, o.label AS option_label, o.active AS option_active
        FROM spec_fields f
        LEFT JOIN spec_options o ON o.field_key = f.key
        ORDER BY f.position ASC, f.key ASC, o.position ASC, o.value ASC
    `

    const byKey = new Map<string, SpecFieldRow>()
    for (const r of rows as any[]) {
        if (!byKey.has(r.key)) {
            byKey.set(r.key, {
                key: r.key,
                label: r.label,
                free_text: r.free_text,
                active: r.field_active,
                options: [],
            })
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
        <div className="container mx-auto px-4 py-6 max-w-3xl">
            <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mb-4">
                <Link href="/pedidos" className="hover:text-foreground">
                    Pedidos
                </Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-foreground">Opciones</span>
            </div>
            <h1 className="text-2xl font-bold mb-1">Opciones de pedido</h1>
            <p className="text-sm text-muted-foreground mb-6">
                El vocabulario que usa el asistente del CRM para tomar pedidos. Si una opción no está
                acá, el asistente no la puede ofrecer. Los cambios los toma solo, sin tocar nada del
                lado del CRM.
            </p>
            <SpecsManager fields={Array.from(byKey.values())} />

            <div className="mt-8">
                <CustomerStatusMap current={statusMap} />
            </div>
        </div>
    )
}
