import { sql } from "@/lib/database"
import { auth } from "@/auth"
import { type BoardCard } from "@/components/orders-board"
import { OrdersView } from "@/components/orders-view"
import { orderNeedsReview } from "@/lib/order-statuses"
import { ViewToggle } from "@/components/view-toggle"

export const dynamic = 'force-dynamic';

// Tablero del taller. Vista principal del módulo: cada columna es un estado y
// las tarjetas se mueven de una a otra. La lista está en /pedidos/lista.
export default async function OrdersPage({
    searchParams,
}: {
    searchParams: { vista?: string; q?: string }
}) {
    // Tablero y lista son la MISMA información vista distinto, así que viven en
    // la misma ruta con un interruptor, no en dos entradas del menú.
    const lista = searchParams.vista === "lista"
    const session = await auth()

    const rows = await sql`
        SELECT o.id, o.order_number, o.external_id, o.customer_name, o.customer_external_id,
               o.status, o.priority, o.origin, o.source_conversation,
               o.delivery_date_estimate::text AS delivery_date_estimate, o.created_at,
               o.alegra_invoice_id,
               o.modified_at::text AS modified_at,
               o.delivery_date_verified_at::text AS delivery_date_verified_at,
               COALESCE(SUM(i.quantity), 0) AS units,
               BOOL_OR(i.needs_review) AS needs_review,
               -- Alguna línea pidió una opción que su hoja de costo no mapea: hay
               -- materiales, pero uno puede ser el equivocado. Distinto de needs_review.
               BOOL_OR(i.unmapped_specs <> '[]'::jsonb) AS has_unmapped,
               -- Qué hay que armar, para mostrarlo en la tarjeta sin abrir el pedido.
               COALESCE(
                   json_agg(json_build_object('quantity', i.quantity, 'product', i.product)
                            ORDER BY i.line_no) FILTER (WHERE i.id IS NOT NULL),
                   '[]'
               ) AS items
        FROM orders o
        LEFT JOIN order_items i ON i.order_id = o.id
        GROUP BY o.id
        ORDER BY
            CASE o.priority WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
            o.delivery_date_estimate ASC NULLS LAST,
            o.created_at ASC
    `

    const cards: BoardCard[] = rows.map((r) => ({
        id: r.id,
        order_number: r.order_number,
        external_id: r.external_id,
        customer_name: r.customer_name,
        customer_external_id: r.customer_external_id,
        status: r.status,
        priority: r.priority,
        origin: r.origin,
        source_conversation: r.source_conversation,
        created_at: r.created_at,
        delivery_date_estimate: r.delivery_date_estimate,
        modified_at: r.modified_at,
        delivery_date_verified_at: r.delivery_date_verified_at,
        units: Number(r.units),
        items: (r.items as any[]).map((i) => ({
            quantity: Number(i.quantity),
            product: i.product as string,
        })),
        needs_review: Boolean(r.needs_review),
        has_unmapped: Boolean(r.has_unmapped),
        alegra_invoice_id: r.alegra_invoice_id ? String(r.alegra_invoice_id) : null,
    }))

    return (
        <div className="h-full flex flex-col w-full px-8 py-6">
            <div className="mb-6 shrink-0 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">Pedidos</h1>
                    <p className="text-base text-muted-foreground">
                        {lista
                            ? "Todos los pedidos, incluidos los cancelados"
                            : "Arrastrá una tarjeta para cambiarle el estado"}
                    </p>
                </div>
                <ViewToggle lista={lista} />
            </div>

            <OrdersView
                cards={cards}
                lista={lista}
                isAdmin={session?.user?.role === "admin"}
            />
        </div>
    )
}
