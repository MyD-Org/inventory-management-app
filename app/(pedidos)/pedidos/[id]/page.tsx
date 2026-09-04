import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore } from "next/cache"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { extraConsumedMaterials, getSpecs, listSellableProducts, materialNeeds, readOrder, reconcileOrderBoms } from "@/lib/orders"
import { orderNeedsReview } from "@/lib/order-statuses"
import { STATUS_LABELS } from "@/lib/order-statuses"
import { ChevronRight, ExternalLink, MessageSquare } from "lucide-react"
import { PrintIconButton } from "@/components/print-icon-button"
import { OrderStatusSelect } from "@/components/order-status-select"
import { OrderItemsEditor } from "@/components/order-items-editor"
import { InvoiceButton } from "@/components/invoice-button"
import { LinkInvoiceButton } from "@/components/link-invoice-button"
import { RemissionButton } from "@/components/remission-button"
import { DocumentStaleTag } from "@/components/document-stale-tag"
import { EmissionSlot, OrderEmissionProvider } from "@/components/order-emission"
import { OrderMaterials } from "@/components/order-materials"
import { DateField, PriorityField, TextField } from "@/components/order-props-editor"
import { OrderCustomerField } from "@/components/order-customer-field"
import { OrderActivity } from "@/components/order-activity"
import { describeDrift, listDocumentDrift, listOrderEvents } from "@/lib/order-events"

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

// Celda de la fila de datos del encabezado.
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex-1 min-w-[9.5rem] border-r last:border-r-0 px-4 py-2.5 flex flex-col gap-1">
            <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                {label}
            </dt>
            <dd className="text-sm min-w-0">{children}</dd>
        </div>
    )
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

    // Las líneas que quedaron sin lista de materiales se vuelven a resolver cada
    // vez que se abre el pedido: si mientras tanto se cargó la hoja de costo del
    // producto, el BOM se explota ahora y la advertencia desaparece sola. No hace
    // nada si el pedido ya salió o si ya se descontó stock (ver reconcileOrderBoms).
    await reconcileOrderBoms(id)

    const order = await readOrder(id)
    if (!order) notFound()

    const session = await auth()
    const isAdmin = session?.user?.role === "admin"

    // Los productos del selector salen del CATÁLOGO de Alegra, no de las hojas
    // de costo: un producto existe porque se vende, y la hoja es opcional.
    const [needs, extras, vocab, products, events, invoiceDrift, remissionDrift] = await Promise.all([
        materialNeeds(id),
        extraConsumedMaterials(id),
        getSpecs(),
        listSellableProducts(),
        listOrderEvents(id),
        // Qué se tocó desde que cada documento quedó al día. Vacío si está en hora.
        order.invoice_stale ? listDocumentDrift(id, "invoice") : Promise.resolve([]),
        order.remission_stale ? listDocumentDrift(id, "remission") : Promise.resolve([]),
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

    const units = order.items.reduce((sum, i) => sum + Number(i.quantity), 0)
    // Vencido: la fecha ya pasó y el pedido todavía no salió. Mismo criterio que
    // el tablero, para que un pedido no aparezca vencido en un lado y no en el otro.
    const overdue = (() => {
        const d = order.delivery_date_estimate
        if (!d || order.status === "retirado" || order.status === "cancelado") return false
        const [y, m, day] = d.split("-").map(Number)
        const eta = new Date(y, m - 1, day)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return eta < today
    })()


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

            {/* En pantalla el cliente es el título: es la primera pregunta al abrir
                un pedido, y hasta ahora vivía perdido en la columna de la derecha. */}
            <header className="no-print mb-6 border-b pb-5">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0 mb-3">
                    <Link href="/pedidos" className="hover:text-foreground">
                        Pedidos
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-mono text-foreground tabular-nums">#{order.order_number}</span>
                </div>

                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <h1 className="font-display text-3xl font-bold tracking-tight leading-tight truncate">
                            {order.customer_name ?? order.customer_external_id}
                        </h1>
                        {/* Debajo del cliente va solo cuándo entró el pedido. El
                            teléfono, el cliente de Alegra y la referencia viven en la
                            columna de la derecha: se consultan, no se leen de corrido. */}
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Creado{" "}
                            {new Date(order.created_at).toLocaleDateString("es-AR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                            })}
                        </p>
                    </div>
                    <PrintIconButton />
                </div>

                {/* Los cinco datos que se preguntan al abrir el pedido, en fila y
                    siempre visibles, en lugar de perdidos en una columna larga. */}
                {/* El provider abarca la fila entera porque el que dispara la
                    emisión (el selector de estado) y los que la informan (las
                    celdas de Factura y Remito) son lugares distintos de la misma
                    fila. */}
                <OrderEmissionProvider>
                <dl className="mt-5 flex flex-wrap rounded-lg border bg-muted/40 overflow-hidden">
                    <Fact label="Estado">
                        <OrderStatusSelect
                            id={order.id}
                            status={order.status}
                            hasInvoice={Boolean(order.alegra_invoice_id)}
                            hasRemission={Boolean(order.alegra_remission_id)}
                        />
                    </Fact>
                    {/* Editable acá y en un solo lugar: antes estaba dos veces,
                        arriba de solo lectura y abajo en el aside para tocarla. */}
                    <Fact label="Entrega estimada">
                        <div className="flex items-center gap-2 min-w-0">
                            <DateField id={order.id} value={order.delivery_date_estimate} />
                            {overdue && (
                                <span className="shrink-0 text-xs font-semibold text-destructive">
                                    vencida
                                </span>
                            )}
                        </div>
                    </Fact>
                    <Fact label="Prioridad">
                        <span className="font-medium">
                            {PRIORITY_LABELS[order.priority] ?? order.priority}
                        </span>
                    </Fact>
                    <Fact label="Trabajo">
                        <span className="font-mono tabular-nums font-medium">{units} u.</span>
                    </Fact>
                    {/* La celda es para todos: emitir lo puede hacer cualquiera del
                        taller. Lo que sigue siendo del admin son los IMPORTES, y esos
                        los recorta el server en la simulación, no esta pantalla. */}
                    <Fact label="Factura">
                        <EmissionSlot doc="invoice">
                            {order.alegra_invoice_id ? (
                                <div className="flex flex-col items-start gap-1.5">
                                    {/* El triángulo va pegado al número: es de esa
                                        factura de lo que avisa. Abre el detalle de
                                        qué cambió, y el botón queda debajo. Así el
                                        aviso no se lleva puesta la columna del
                                        trabajo, que es lo que el taller lee. */}
                                    <div className="flex items-center gap-1.5">
                                        <a
                                            href={`https://app.alegra.com/invoice/view/id/${order.alegra_invoice_id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                        >
                                            {order.alegra_invoice_number ?? `#${order.alegra_invoice_id}`}
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                        {order.invoice_stale && (
                                            <DocumentStaleTag
                                                label="Factura desactualizada"
                                                changes={invoiceDrift.map(describeDrift)}
                                            />
                                        )}
                                    </div>
                                    {order.invoice_stale && (
                                        <InvoiceButton orderId={order.id} mode="actualizar" />
                                    )}
                                </div>
                            ) : (
                                // Visible en cualquier estado: el pedido se puede
                                // facturar antes de estar "Por facturar" (seña, pago
                                // adelantado) y también después, si la automática falló.
                                // El server nunca miró el estado; el gate era solo acá.
                                //
                                // Y al lado, vincular una que ya esté en Alegra: pasa
                                // seguido que la factura se hizo antes que el pedido, y
                                // ahí emitir otra sería cobrarle dos veces al cliente.
                                <div className="flex flex-wrap items-center gap-1">
                                    <InvoiceButton orderId={order.id} />
                                    <LinkInvoiceButton orderId={order.id} />
                                </div>
                            )}
                        </EmissionSlot>
                    </Fact>
                    {/* El remito es independiente de la factura y en cualquier
                        orden: a veces sale primero uno, a veces el otro. */}
                    <Fact label="Remito">
                        <EmissionSlot doc="remission">
                            {order.alegra_remission_id ? (
                            <div className="flex flex-col items-start gap-1.5">
                                <div className="flex items-center gap-1.5">
                                    <a
                                        href={`https://app.alegra.com/remission/view/id/${order.alegra_remission_id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                    >
                                        {order.alegra_remission_number ?? `#${order.alegra_remission_id}`}
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                    {order.remission_stale && (
                                        <DocumentStaleTag
                                            label="Remito desactualizado"
                                            changes={remissionDrift.map(describeDrift)}
                                        />
                                    )}
                                </div>
                                {order.remission_stale && (
                                    <RemissionButton orderId={order.id} mode="actualizar" />
                                )}
                            </div>
                        ) : (
                            <RemissionButton orderId={order.id} />
                            )}
                        </EmissionSlot>
                    </Fact>
                </dl>
                </OrderEmissionProvider>
            </header>

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
                            highlightedItemId={Number.isFinite(highlightedItemId) ? highlightedItemId : undefined}
                        />
                    </section>

                    {/* 2. Materiales a utilizar, con su estado de stock */}
                    <OrderMaterials orderId={order.id} needs={needs} extras={extras} />

                    {/* 3. Quién hizo qué, y las notas del taller */}
                    <OrderActivity orderId={order.id} events={events} />

                    {/* 4. Avisos, al final */}
                    {/* En papel las propiedades van en una línea al pie, no en
                        una columna larga: el cliente ya está en el encabezado y
                        el resto son datos de referencia. */}
                    {/* En papel salen las notas, que son instrucciones para el taller.
                        Los cambios de campo no: eso se consulta en pantalla. */}
                    {events.filter((e) => e.kind === "note").length > 0 && (
                        <div className="hidden print:block border-t pt-2 mb-3 space-y-1.5">
                            {events
                                .filter((e) => e.kind === "note")
                                .slice()
                                .reverse()
                                .map((e) => (
                                    <div key={e.id} className="text-base">
                                        <span className="font-medium">{e.actor_name}: </span>
                                        {e.body}
                                    </div>
                                ))}
                        </div>
                    )}
                    <div className="hidden print:block border-t pt-2 text-sm text-muted-foreground">
                        Estado {STATUS_LABELS[order.status]}
                        {" · "}Prioridad {PRIORITY_LABELS[order.priority] ?? order.priority}
                        {" · "}Creado{" "}
                        {new Date(order.created_at).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                        })}
                        {order.delivery_date_estimate && (
                            <>{" · "}Entrega estimada {formatDate(order.delivery_date_estimate)}</>
                        )}
                    </div>
                </div>

                {/* ---------- Propiedades ----------
                    Tres grupos con título en vez de doce propiedades sueltas:
                    lo que se sigue, quién es el cliente y lo administrativo.
                    Estado, entrega, prioridad y factura ya viven en el
                    encabezado; acá queda lo que se consulta, no lo que se opera. */}
                <aside className="no-print lg:border-l lg:pl-5 lg:sticky lg:top-4 flex flex-col gap-6">
                    {/* El grupo entero depende del link: las notas se mudaron al hilo
                        de actividad, así que sin conversación no queda nada adentro y
                        el título solo era un encabezado colgado. */}
                    {order.source_conversation && (
                        <div className="flex flex-col gap-2.5">
                            <h2 className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground border-b pb-2">
                                Seguimiento
                            </h2>
                            <a
                                href={order.source_conversation}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted/50 transition-colors"
                            >
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="flex-1 min-w-0 truncate">Ver la conversación</span>
                                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                            </a>
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <h2 className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground border-b pb-2 mb-1.5">
                            Cliente
                        </h2>
                        <Prop label="Nombre">
                            <OrderCustomerField
                                orderId={order.id}
                                customerName={order.customer_name}
                                customerExternalId={order.customer_external_id}
                            />
                        </Prop>
                        <Prop label="Teléfono">
                            <TextField
                                id={order.id}
                                value={order.customer_phone}
                                field="customer_phone"
                                placeholder="Sin teléfono"
                                label="Teléfono"
                            />
                        </Prop>
                    </div>

                    <div className="flex flex-col gap-1">
                        <h2 className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground border-b pb-2 mb-1.5">
                            Administración
                        </h2>
                        <Prop label="Prioridad">
                            <PriorityField id={order.id} value={order.priority} />
                        </Prop>
                        {isAdmin && order.invoice_warnings?.length > 0 && (
                            <Prop label="Factura">
                                <p className="text-xs text-amber-600">
                                    {order.alegra_invoice_id ? "Salió incompleta: " : ""}
                                    {order.invoice_warnings.join(" ")}
                                </p>
                            </Prop>
                        )}
                        <Prop label="Origen">{order.origin}</Prop>
                    </div>
                </aside>
            </div>
        </div>
    )
}
