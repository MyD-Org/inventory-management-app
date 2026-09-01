import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { ChevronRight } from "lucide-react"
import { SpecsManager, type SpecFieldRow } from "@/components/specs-manager"
import { isFixedSpecField } from "@/lib/order-statuses"

export const dynamic = "force-dynamic"

// Vocabulario de variaciones de producto: color de LED, óptica, grampa, estaca.
//
// VIVE EN CONFIGURACIÓN, NO EN PEDIDOS. Antes se editaba desde /pedidos/opciones y
// solo se llegaba por el menú del tablero, pero el vocabulario no es de los pedidos:
// lo usan las familias de materiales y las fichas de producto para decidir qué
// material sale por cada variante, y el asistente del CRM para tomar el pedido. Es
// configuración del inventario que los pedidos consumen, no al revés.
//
// Lo consume el bot por GET /api/specs: agregar una opción acá alcanza para que la
// pueda ofrecer, sin tocar nada del lado del CRM.
export default async function VariacionesPage() {
    const session = await auth()
    if (session?.user?.role !== "admin") redirect("/")

    const rows = await sql`
        SELECT f.key, f.label, f.free_text, f.kind, f.active AS field_active,
               f.offered_to_customer,
               o.id AS option_id, o.value, o.label AS option_label, o.active AS option_active
        FROM spec_fields f
        LEFT JOIN spec_options o ON o.field_key = f.key
        ORDER BY f.position ASC, f.key ASC, o.position ASC, o.value ASC
    `

    const byKey = new Map<string, SpecFieldRow>()
    for (const r of rows as any[]) {
        // Los campos fijos no se listan: no se administran, y mostrarlos sin
        // controles solo invita a preguntar por qué no se pueden tocar.
        if (isFixedSpecField(r.key)) continue
        if (!byKey.has(r.key)) {
            byKey.set(r.key, {
                key: r.key,
                label: r.label,
                free_text: r.free_text,
                kind: r.kind ?? (r.free_text ? "text" : "list"),
                active: r.field_active,
                offered_to_customer: r.offered_to_customer,
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
        <div className="mx-auto w-full max-w-3xl px-8 py-6">
            <div className="flex items-center gap-1.5 text-base text-muted-foreground mb-4">
                <Link href="/settings" className="hover:text-foreground">
                    Configuración
                </Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-foreground">Variaciones de producto</span>
            </div>
            <h1 className="text-2xl font-bold mb-6">Variaciones de producto</h1>
            <SpecsManager fields={Array.from(byKey.values())} />
        </div>
    )
}
