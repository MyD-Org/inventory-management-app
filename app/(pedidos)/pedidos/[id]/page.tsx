import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore } from "next/cache"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { consumedMaterials, extraConsumedMaterials, getSpecs, listSellableProducts, materialNeeds, orderItemRecipes, readOrder, reconcileOrderBoms } from "@/lib/orders"
import { orderNeedsReview } from "@/lib/order-statuses"
import { acceptsItemChanges, STATUS_LABELS } from "@/lib/order-statuses"
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
import { canConsumeStock } from "@/lib/roles"
import { DateField, PriorityField, TextField } from "@/components/order-props-editor"
import { OrderCustomerField } from "@/components/order-customer-field"
import { OrderActivity } from "@/components/order-activity"
import { describeDrift, listDocumentDrift, listOrderEvents, type OrderEvent } from "@/lib/order-events"
import { noteHasContent } from "@/lib/order-notes"
import { listOrderRemissions, type EmittedRemission } from "@/lib/remissions"
import { DELIVERY_LABELS, deliveredOverflow, deliveryState, pendingQuantity, round2, type DeliveryState } from "@/lib/deliveries"

export const dynamic = 'force-dynamic';

// Orden de trabajo del taller. El orden de la página es el orden en que se
// trabaja: primero QUÉ armar, después qué materiales buscar, y al final los
// avisos. Las propiedades del pedido y la conversación viven al costado, para
// no competir con el trabajo.
//
// El BOM es el SNAPSHOT tomado al crear el pedido, no la receta vigente.
// Sin importes: este módulo no maneja plata.

const PRIORITY_LABELS: Record<string, string> = { baja: "Baja", normal: "Normal", alta: "Alta" }

/** Qué notas salen en el papel: las que tienen algo que decir, texto o fotos. */
function esNotaImprimible(e: OrderEvent): boolean {
    return e.kind === "note" && noteHasContent(e)
}

function formatDate(d: string | null): string {
    if (!d) return "—"
    const [y, m, day] = d.split("-").map(Number)
    return new Date(y, m - 1, day).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
}

// Celda de la fila de datos del encabezado. En el celular son seis celdas en
// grilla de dos columnas (separadas por el gap-px del contenedor, que deja ver
// el fondo `bg-border`); desde lg vuelven a ser una fila con bordes propios.
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="bg-muted/40 px-3 py-2.5 flex flex-col gap-1 sm:px-4 lg:bg-transparent lg:flex-1 lg:min-w-[9.5rem] lg:border-r lg:last:border-r-0">
            <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                {label}
            </dt>
            <dd className="text-sm min-w-0">{children}</dd>
        </div>
    )
}

// Factura y remito para quien NO es admin: el taller y el mostrador necesitan
// saber que el documento salió y con qué número —para cantarlo por teléfono, para
// buscarlo en el mostrador—, pero no entran a Alegra. Por eso el número va como
// texto y no como link: el link es una puerta a un sistema que no les corresponde
// y que además les pediría una cuenta que no tienen.
function DocumentoEmitido({ numero, genero }: { numero: string | null; genero: "a" | "o" }) {
    if (numero === null) {
        return <span className="text-muted-foreground">Sin emitir</span>
    }
    return (
        <span className="font-medium">
            {numero} <span className="font-normal text-muted-foreground">· emitid{genero}</span>
        </span>
    )
}

// Los remitos del pedido, con cuánto del pedido ya tiene papel emitido.
//
// DICE REMITIDO Y NO ENTREGADO: que la mercadería tenga su remito no significa que
// el cliente la haya recibido. Eso lo dice el ESTADO del pedido —"Listo para
// retirar" mientras espera, "Retirado" cuando se la llevó— y un pedido puede estar
// remitido entero y seguir en el mostrador.
//
// LA CUENTA VA PRIMERO Y SIEMPRE: "10 de 24 u." es lo que se pregunta al mirar el
// pedido, y es lo único que sirve cuando hay tres remitos. Los números de los
// documentos van abajo, para cantarlos por teléfono o buscarlos en el mostrador.
//
// EL LINK A ALEGRA ES SOLO DEL ADMIN, con el mismo criterio que la factura: el
// taller y el mostrador no entran a Alegra y el link es una puerta a un sistema
// que les pediría una cuenta que no tienen.
function ListaRemitos({
    remissions,
    conLink,
    estado,
    entregado,
    pedido,
}: {
    remissions: EmittedRemission[]
    conLink: boolean
    estado: DeliveryState
    entregado: number
    pedido: number
}) {
    if (remissions.length === 0) {
        return <span className="text-muted-foreground">Sin emitir</span>
    }

    const unidades = (r: EmittedRemission) => r.items.reduce((sum, i) => sum + i.quantity, 0)

    return (
        <div className="flex flex-col items-start gap-1">
            <span
                className={`text-sm font-medium ${
                    estado === "remitido" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                }`}
            >
                {DELIVERY_LABELS[estado]}
                <span className="font-normal text-muted-foreground">
                    {" · "}
                    {entregado} de {pedido} u.
                </span>
            </span>
            <div className="flex flex-col items-start gap-0.5">
                {remissions.map((r) =>
                    conLink && r.url ? (
                        <a
                            key={r.id}
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                            {r.number ?? `#${r.alegraId}`}
                            <span className="font-normal text-muted-foreground tabular-nums">
                                · {unidades(r)} u.
                            </span>
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    ) : (
                        <span key={r.id} className="text-sm font-medium">
                            {r.number ?? `#${r.alegraId}`}
                            <span className="font-normal text-muted-foreground tabular-nums">
                                {" · "}
                                {unidades(r)} u.
                            </span>
                        </span>
                    ),
                )}
            </div>
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
    const [needs, extras, consumed, recipes, vocab, products, events, remissions, invoiceDrift, remissionDrift] = await Promise.all([
        materialNeeds(id),
        extraConsumedMaterials(id),
        // Lo que hoy está afuera del depósito por el pedido: es lo devolvible.
        consumedMaterials(id),
        // La receta por unidad de cada producto, para devolver por producto.
        orderItemRecipes(id),
        getSpecs(),
        listSellableProducts(),
        listOrderEvents(id),
        // Los remitos emitidos: son varios cuando la mercadería sale por partes.
        listOrderRemissions(id),
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

    const units = round2(order.items.reduce((sum, i) => sum + Number(i.quantity), 0))
    // La salida va por partes: lo que ya tiene remito, lo que falta y en qué estado
    // queda el pedido. Es la cuenta que hacen la fila del producto, la celda de
    // Remito y los botones de emitir.
    const entregables = order.items.map((i) => ({
        id: i.id,
        product: i.product,
        quantity: Number(i.quantity),
        delivered: Number(i.delivered_quantity),
        handedOver: Number(i.handed_over_quantity),
    }))
    const estadoEntrega = deliveryState(entregables)
    // round2 en las dos: son sumas de DECIMAL(10,2) que llegan como float y la
    // celda salía diciendo "10.000000000000002 de 24 u.".
    const entregado = round2(entregables.reduce((sum, i) => sum + i.delivered, 0))
    const pendiente = round2(entregables.reduce((sum, i) => sum + pendingQuantity(i), 0))
    // Se remitió más de lo que el pedido pide: alguien achicó una línea después de
    // remitir. El papel ya salió, así que lo único que corresponde es avisarlo.
    const sobreEntregado = deliveredOverflow(entregables)
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
        <div className="w-full px-4 py-6 sm:px-8">
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

                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight leading-tight truncate">
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
                <dl className="mt-5 grid grid-cols-2 gap-px rounded-lg border bg-border overflow-hidden lg:flex lg:flex-wrap lg:gap-0 lg:bg-muted/40">
                    <Fact label="Estado">
                        <OrderStatusSelect
                            id={order.id}
                            status={order.status}
                            hasInvoice={Boolean(order.alegra_invoice_id)}
                            deliveryComplete={pendiente <= 0}
                        />
                    </Fact>
                    {/* Editable acá y en un solo lugar: antes estaba dos veces,
                        arriba de solo lectura y abajo en el aside para tocarla. */}
                    <Fact label="Entrega estimada">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                            <DateField id={order.id} value={order.delivery_date_estimate} />
                            {overdue && (
                                <span className="shrink-0 text-xs font-semibold text-destructive">
                                    vencida
                                </span>
                            )}
                        </div>
                    </Fact>
                    {/* Editable acá, como la fecha: se cambia donde se lee, no en
                        el aside de abajo. */}
                    <Fact label="Prioridad">
                        <PriorityField id={order.id} value={order.priority} />
                    </Fact>
                    <Fact label="Trabajo">
                        <span className="font-mono tabular-nums font-medium">{units} u.</span>
                    </Fact>
                    {/* EMITIR factura y remito es del admin: el taller no emite ni
                        entra a Alegra, y la emisión AUTOMÁTICA al pasar a "Facturar y
                        remitir" sigue funcionando para todos —lo que no está para el
                        resto es la puerta manual, no el circuito—.
                        LEER que ya salieron, en cambio, es de todos: el taller y el
                        mostrador necesitan saber si el pedido está facturado y con qué
                        número. Por eso la celda se ve siempre y lo que cambia es el
                        contenido: el admin tiene el link a Alegra, los avisos de
                        desactualizado y los botones; el resto, el número y nada más. */}
                    <Fact label="Factura">
                        {!isAdmin ? (
                            <DocumentoEmitido
                                numero={
                                    order.alegra_invoice_id
                                        ? order.alegra_invoice_number ?? `#${order.alegra_invoice_id}`
                                        : null
                                }
                                genero="a"
                            />
                        ) : (
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
                        )}
                    </Fact>
                    {/* El remito es independiente de la factura y en cualquier
                        orden: a veces sale primero uno, a veces el otro.

                        Y son VARIOS cuando la mercadería sale por partes, así que
                        la celda no muestra "el" remito: muestra los que salieron y
                        cuánto del pedido ya se entregó. Eso último lo ve todo el
                        mundo, admin o no —el taller y el mostrador necesitan saber
                        qué falta cargar en la camioneta—; lo que es del admin son
                        los links a Alegra y los botones de emitir. */}
                    <Fact label={remissions.length > 1 ? "Remitos" : "Remito"}>
                        {!isAdmin ? (
                            <ListaRemitos
                                remissions={remissions}
                                conLink={false}
                                estado={estadoEntrega}
                                entregado={entregado}
                                pedido={units}
                            />
                        ) : (
                        <EmissionSlot doc="remission">
                            <div className="flex flex-col items-start gap-1.5">
                                <ListaRemitos
                                    remissions={remissions}
                                    conLink
                                    estado={estadoEntrega}
                                    entregado={entregado}
                                    pedido={units}
                                />
                                {order.remission_stale && remissions.length > 0 && (
                                    <DocumentStaleTag
                                        label="Último remito desactualizado"
                                        changes={remissionDrift.map(describeDrift)}
                                    />
                                )}
                                <div className="no-print flex flex-wrap items-center gap-1">
                                    {/* Mientras quede mercadería adentro se puede
                                        emitir otro remito: el pedido sale por partes
                                        y cada parte es su propio papel. */}
                                    {pendiente > 0 && (
                                        <RemissionButton
                                            orderId={order.id}
                                            label={remissions.length > 0 ? "Remitir el resto" : undefined}
                                        />
                                    )}
                                    {/* Corregir lo que dice el último papel es otra
                                        cosa que entregar el resto, y por eso son dos
                                        botones distintos. */}
                                    {order.remission_stale && remissions.length > 0 && (
                                        <RemissionButton orderId={order.id} mode="actualizar" />
                                    )}
                                </div>
                            </div>
                        </EmissionSlot>
                        )}
                    </Fact>
                </dl>
                </OrderEmissionProvider>
            </header>

            <div className="orden-trabajo grid gap-6 lg:gap-8 lg:grid-cols-[1fr_250px] items-start">
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
                                // Cuánto de esta línea ya salió del depósito: la
                                // entrega puede ir por partes y el taller tiene que
                                // ver en la fila qué falta armar.
                                delivered: Number(i.delivered_quantity),
                                // Lo entregado al cliente es OTRO hecho que lo
                                // remitido: lo marca una persona, no el papel.
                                handedOver: Number(i.handed_over_quantity),
                                specs: i.specs,
                                needs_review: i.needs_review,
                                unmapped_specs: i.unmapped_specs ?? [],
                            }))}
                            vocab={vocab}
                            products={products}
                            highlightedItemId={Number.isFinite(highlightedItemId) ? highlightedItemId : undefined}
                            /* Un pedido que ya salió del taller no admite cambios
                               en sus líneas: están facturadas, remitidas y
                               embaladas. El servidor lo rechaza igual (ver
                               itemsCongelados); esto es para no ofrecer un botón
                               que va a fallar. */
                            readOnly={!acceptsItemChanges(order.status)}
                            readOnlyMessage={`El pedido está en "${STATUS_LABELS[order.status]}": sus productos ya no se modifican.`}
                        />
                    </section>

                    {/* La línea se achicó después de haber remitido: el papel ya
                        salió diciendo que esa mercadería se entregaba. No se
                        arregla solo —un remito se anula, no se borra— así que lo
                        único honesto es decir cuál es y esperar que alguien lo
                        resuelva en Alegra. */}
                    {sobreEntregado.length > 0 && (
                        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                            <p className="font-medium">Se remitieron más unidades de las pedidas</p>
                            <ul className="mt-1 list-disc pl-4">
                                {sobreEntregado.map((i) => (
                                    <li key={i.id}>
                                        {i.product}: remitidas {i.delivered}, pedidas {i.quantity}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* 2. Materiales a utilizar, con su estado de stock */}
                    <OrderMaterials
                        orderId={order.id}
                        needs={needs}
                        extras={extras}
                        consumed={consumed}
                        recipes={recipes}
                        canConsume={canConsumeStock(session?.user?.role)}
                    />

                    {/* 3. Quién hizo qué, y las notas del taller */}
                    <OrderActivity
                        orderId={order.id}
                        events={events}
                        currentEmail={session?.user?.email ?? null}
                        isAdmin={isAdmin}
                    />

                    {/* 4. Avisos, al final */}
                    {/* En papel las propiedades van en una línea al pie, no en
                        una columna larga: el cliente ya está en el encabezado y
                        el resto son datos de referencia. */}
                    {/* En papel salen las notas, que son instrucciones para el taller.
                        Los cambios de campo no: eso se consulta en pantalla. */}
                    {/* Una nota que es solo foto no tiene texto que imprimir, y sin
                        este filtro salía como "Dalila:" y nada. La foto no va al
                        papel, así que se avisa que hay que mirar la pantalla. */}
                    {events.filter(esNotaImprimible).length > 0 && (
                        <div className="hidden print:block border-t pt-2 mb-3 space-y-1.5">
                            {events
                                .filter(esNotaImprimible)
                                .slice()
                                .reverse()
                                .map((e) => (
                                    <div key={e.id} className="text-base">
                                        <span className="font-medium">{e.actor_name}: </span>
                                        {e.body}
                                        {e.photos.length > 0 && (
                                            <span className="italic">
                                                {e.body ? " " : ""}
                                                [{e.photos.length}{" "}
                                                {e.photos.length === 1 ? "foto" : "fotos"} en el
                                                pedido]
                                            </span>
                                        )}
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
                        {order.reference && <>{" · "}Ref. {order.reference}</>}
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
                        {isAdmin && order.invoice_warnings?.length > 0 && (
                            <Prop label="Factura">
                                <p className="text-xs text-amber-600">
                                    {order.alegra_invoice_id ? "Salió incompleta: " : ""}
                                    {order.invoice_warnings.join(" ")}
                                </p>
                            </Prop>
                        )}
                        {/* El código con el que el cliente nombra al pedido (orden de
                            compra, expediente). Editable acá: entra después del alta,
                            cuando llega el papel. */}
                        <Prop label="Referencia">
                            <TextField
                                id={order.id}
                                value={order.reference}
                                field="reference"
                                placeholder="Sin referencia"
                                label="Referencia"
                                saved="Referencia actualizada"
                            />
                        </Prop>
                        <Prop label="Origen">{order.origin}</Prop>
                    </div>
                </aside>
            </div>
        </div>
    )
}
