import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { OrdersTable, type OrderRow } from "@/components/orders-table"

export const dynamic = 'force-dynamic';

// Pedidos que entran por la API desde el agente del CRM, más los que se cargan
// a mano acá. Los dos caminos comparten la lógica de lib/orders.ts.
export default async function OrdersPage({
    searchParams,
}: {
    searchParams: { cliente?: string }
}) {
    const session = await auth()
    if (!session?.user) redirect('/login')

    const cliente = (searchParams.cliente ?? "").trim()
    const like = `%${cliente}%`

    const rows = cliente
        ? await sql`
            SELECT o.id, o.external_id, o.customer_external_id, o.customer_name, o.status,
                   o.source_conversation, o.created_at,
                   COUNT(i.id) AS line_count,
                   COALESCE(SUM(i.qty * i.unit_price), 0) AS total,
                   BOOL_OR(i.needs_review) AS needs_review
            FROM orders o
            LEFT JOIN order_items i ON i.order_id = o.id
            WHERE o.customer_external_id ILIKE ${like} OR o.customer_name ILIKE ${like}
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `
        : await sql`
            SELECT o.id, o.external_id, o.customer_external_id, o.customer_name, o.status,
                   o.source_conversation, o.created_at,
                   COUNT(i.id) AS line_count,
                   COALESCE(SUM(i.qty * i.unit_price), 0) AS total,
                   BOOL_OR(i.needs_review) AS needs_review
            FROM orders o
            LEFT JOIN order_items i ON i.order_id = o.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `

    const orders: OrderRow[] = rows.map((r) => ({
        id: r.id,
        external_id: r.external_id,
        customer_external_id: r.customer_external_id,
        customer_name: r.customer_name,
        status: r.status,
        source_conversation: r.source_conversation,
        created_at: r.created_at,
        line_count: Number(r.line_count),
        total: Number(r.total),
        needs_review: Boolean(r.needs_review),
    }))

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Pedidos</h1>
                        <p className="text-sm text-muted-foreground">
                            Los que toma el asistente del CRM y los que cargás a mano
                        </p>
                    </div>
                    <Link href="/pedidos/nuevo">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nuevo Pedido
                        </Button>
                    </Link>
                </div>
                <OrdersTable orders={orders} initialFilter={cliente} isAdmin={session.user.role === 'admin'} />
            </main>
        </div>
    )
}
