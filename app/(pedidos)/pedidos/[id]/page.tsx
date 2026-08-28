import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore } from "next/cache"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { getSpecs, listSellableProducts, materialNeeds, readOrder } from "@/lib/orders"
import { orderNeedsReview } from "@/lib/order-statuses"
import { STATUS_LABELS } from "@/lib/order-statuses"
import { ChevronRight, ExternalLink, MessageSquare } from "lucide-react"
import { PrintIconButton } from "@/components/print-icon-button"
import { OrderStatusSelect } from "@/components/order-status-select"
import { OrderItemsEditor } from "@/components/order-items-editor"
import { InvoiceButton } from "@/components/invoice-button"
import { OrderMaterials } from "@/components/order-materials"
import { DateField, NotesField, PriorityField, TextField } from "@/components/order-props-editor"
import { OrderCustomerField } from "@/components/order-customer-field"

export const dynamic = 'force-dynamic';

// Orden de trabajo del taller. El orden de la página es el orden en que se
// trabaja: primero QUÉ armar, después qué materiales buscar, y al final los
// avisos. Las propiedades del pedido y la conversación viven al costado, para
// no competir con el trabajo.
//
// El BOM es el SNAPSHOT tomado al crear el pedido, no la receta vigente.
// Sin importes: este módulo no maneja plata.

const PRIORITY_LABELS: Record<string, string> = { baja: "Baja", normal: "Normal", alta: "Alta" }

function formatDate(d: string | null): string {
    if (!d) return "—"
    const [y, m, day] = d.split("-").map(Number)
    return new Date(y, m - 1, day).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
}

function customerSourceLabel(externalId: string | null): string | null {
    if (!externalId) return null
    if (externalId.startsWith("alegra:")) return `Alegra · #${externalId.slice(7)}`
    if (externalId.startsWith("manual:")) return "Cliente manual"
    return externalId
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[86px_1fr] items-center gap-2 py-1">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className="text-base min-w-0">{children}</div>
        </div>
    )
}

export default async function OrderDetailPage({
    params,
    searchParams,
}: {
    params: { id: string }
    searchParams: { highlight?: string }
}) {
    // El detalle se abre muchas veces desde el tablero justo después de que el
    // bot o el CRM mutaron el pedido. Evitamos que el Router Cache de Next.js
    // sirva una versión stale sin los ítems recién agregados.
    unstable_noStore()

    const id = Number.parseInt(params.id, 10)
    if (!Number.isFinite(id)) notFound()

    const highlightedItemId = Number(searchParams.highlight)

    // Si el pedido fue modificado desde el CRM y todavía no se verificó,
    // marcamos la revisión al abrir el detalle. El banner desaparece de la
    // vista y del tablero a partir de este momento.
    await sql`
        UPDATE orders
        SET delivery_date_verified_at = NOW()
        WHERE id = ${id}
          AND modified_at IS NOT NULL
          AND (delivery_date_verified_at IS NULL OR delivery_date_verified_at < modified_at)
    `

    const order = await readOrder(id)
    if (!order) notFound()

    const session = await auth()
    const isAdmin = session?.user?.role === "admin"

    // Los productos del selector salen del CATÁLOGO de Alegra, no de las hojas
    // de costo: un producto existe porque se vende, y la hoja es opcional.
    const [needs, vocab, products] = await Promise.all([
        materialNeeds(id),
        getSpecs(),
        listSellableProducts(),
    ])

    // Specs en el orden del vocabulario y solo los valores: "ámbar · grampa larga · 25°"
    // se lee de corrido, mientras que con etiquetas ocupa el triple.
    const specsLine = (specs: Record<string, string>) =>
        Object.keys(vocab)
            .filter((k) => specs[k])
            .map((k) => specs[k])
            .join(" · ")

    // Los boolean no cuentan como faltantes: no marcarlos ya es una respuesta.
    const unanswered = (specs: Record<string, string>) =>
        Object.entries(vocab).filter(([k, f]) => f.kind === "list" && !specs[k])


    return (
        <div className="w-full px-8 py-6">
            {/* Encabezado de la hoja impresa: arriba el cliente, que es lo que
                identifica el trabajo en el taller. En pantalla no hace falta,
                están las migas y la barra de propiedades. */}
            <div className="hidden print:flex items-baseline justify-between gap-4 border-b pb-3 mb-5">
                <h1 className="text-lg font-semibold">
                    {order.customer_name ?? order.customer_external_id}
                </h1>
                <span className="text-base text-muted-foreground tabular-nums">
                    Pedido #{order.order_number}
                </span>
            </div>

            <div className="flex items-center justify-between gap-4 mb-5 no-print">
                <div className="flex items-center gap-1.5 text-base text-muted-foreground min-w-0">
                    <Link href="/pedidos" className="hover:text-foreground">
                        Pedidos
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-foreground tabular-nums">#{order.order_number}</span>
                </div>
                <PrintIconButton />
            </div>

            <div className="orden-trabajo grid gap-8 lg:grid-cols-[1fr_250px] items-start">
                {/* ---------- El trabajo ---------- */}
                <div className="min-w-0 space-y-7">
                    {/* 1. Qué armar */}
                    {orderNeedsReview({
                        modified_at: order.modified_at,
                        delivery_date_verified_at: order.delivery_date_verified_at,
                    }) && (
                        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                            Pedido modificado desde el CRM. Revisá la fecha de entrega.
                        </div>
                    )}
                    <section>
                        <OrderItemsEditor
                            orderId={order.id}
                            items={order.items.map((i) => ({
                                id: i.id,
                                product: i.product,
                                quantity: i.quantity,
                                specs: i.specs,
                                needs_review: i.needs_review,
                                unmapped_specs: i.unmapped_specs ?? [],
                            }))}
                            vocab={vocab}
                            products={products}
                            readOnly={Boolean(order.alegra_invoice_id)}
                            readOnlyMessage={order.alegra_invoice_id ? "Pedido facturado: no se pueden editar ítems" : undefined}
                            highlightedItemId={Number.isFinite(highlightedItemId) ? highlightedItemId : undefined}
                        />
                    </section>

                    {/* 2. Qué buscar al depósito, con su estado de stock */}
                    <OrderMaterials orderId={order.id} needs={needs} />

                    {/* 3. Avisos, al final */}
                    {/* En papel las propiedades van en una línea al pie, no en
                        una columna larga: el cliente ya está en el encabezado y
                        el resto son datos de referencia. */}
                    <div className="hidden print:block border-t pt-2 text-sm text-muted-foreground">
                        Prioridad {PRIORITY_LABELS[order.priority] ?? order.priority}
                        {" · "}Creado{" "}
                        {new Date(order.created_at).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                        })}
                        {order.delivery_date_estimate && (
                            <>{" · "}Entrega {formatDate(order.delivery_date_estimate)}</>
                        )}
                    </div>
                </div>

                {/* ---------- Propiedades ---------- */}
                <aside className="no-print lg:border-l lg:pl-5 lg:sticky lg:top-4">
                    {order.source_conversation && (
                        <a
                            href={order.source_conversation}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-md border px-2.5 py-2 mb-3 text-base hover:bg-muted/50 transition-colors no-print"
                        >
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="flex-1 min-w-0 truncate">Ver la conversación</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                        </a>
                    )}

                    <div className="mb-3 no-print">
                        <NotesField id={order.id} value={order.notes} />
                    </div>
                    {order.notes && (
                        <div className="hidden print:block rounded-md bg-muted/50 p-2.5 text-base mb-3">
                            {order.notes}
                        </div>
                    )}

                    <Prop label="Estado">
                        <div className="-ml-1.5 no-print">
                            <OrderStatusSelect id={order.id} status={order.status} />
                        </div>
                        <span className="hidden print:inline">{STATUS_LABELS[order.status]}</span>
                    </Prop>

                    {/* La factura es información contable: la ve el admin, no el
                        operador del taller, que trabaja con la misma pantalla.
                        Cualquiera puede mover la tarjeta a "Por facturar" y el
                        borrador se genera automáticamente; lo que no ve el operador
                        es el resultado. */}
                    {isAdmin && (
                        <Prop label="Factura">
                            {order.alegra_invoice_id ? (
                                <>
                                    <a
                                        href={`https://app.alegra.com/invoice/view/id/${order.alegra_invoice_id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="no-print inline-flex items-center gap-1 text-primary hover:underline"
                                    >
                                        {order.alegra_invoice_number ?? `#${order.alegra_invoice_id}`}
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                    <span className="hidden print:inline">
                                        {order.alegra_invoice_number ?? `#${order.alegra_invoice_id}`}
                                    </span>
                                </>
                            ) : order.status === "por_facturar" ? (
                                <div className="-ml-1.5">
                                    <InvoiceButton orderId={order.id} />
                                </div>
                            ) : null}
                            {order.invoice_warnings?.length > 0 && (
                                <p className="no-print mt-1 text-xs text-amber-600">
                                    {order.alegra_invoice_id ? "Salió incompleta: " : ""}
                                    {order.invoice_warnings.join(" ")}
                                </p>
                            )}
                        </Prop>
                    )}

                    <Prop label="Prioridad">
                        <span className="no-print block">
                            <PriorityField id={order.id} value={order.priority} />
                        </span>
                        <span className="hidden print:inline">
                            {PRIORITY_LABELS[order.priority] ?? order.priority}
                        </span>
                    </Prop>

                    <Prop label="Entrega">
                        <span className="no-print block">
                            <DateField id={order.id} value={order.delivery_date_estimate} />
                        </span>
                        <span className="hidden print:inline">
                            {formatDate(order.delivery_date_estimate)}
                        </span>
                    </Prop>

                    <div className="h-px bg-border my-2.5" />

                    <Prop label="Cliente">
                        <span className="no-print block">
                            <OrderCustomerField
                                orderId={order.id}
                                customerName={order.customer_name}
                                customerExternalId={order.customer_external_id}
                            />
                        </span>
                        <span className="hidden print:inline">{order.customer_name ?? "—"}</span>
                        <span className="block text-sm text-muted-foreground truncate px-1.5 -ml-1.5">
                            {customerSourceLabel(order.customer_external_id)}
                        </span>
                    </Prop>

                    <Prop label="Teléfono">
                        <span className="no-print block">
                            <TextField
                                id={order.id}
                                value={order.customer_phone}
                                field="customer_phone"
                                placeholder="Sin teléfono"
                                label="Teléfono"
                            />
                        </span>
                        <span className="hidden print:inline">{order.customer_phone ?? "—"}</span>
                    </Prop>

                    <div className="h-px bg-border my-2.5" />

                    <Prop label="Origen">{order.origin}</Prop>
                    <Prop label="Referencia">
                        <code className="text-sm text-muted-foreground break-all">{order.external_id}</code>
                    </Prop>
                    <Prop label="Creado">
                        {new Date(order.created_at).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                        })}
                    </Prop>
                </aside>
            </div>
        </div>
    )
}
