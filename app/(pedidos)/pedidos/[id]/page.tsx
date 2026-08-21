import Link from "next/link"
import { notFound } from "next/navigation"
import { getSpecs, materialNeeds, readOrder } from "@/lib/orders"
import { STATUS_LABELS } from "@/lib/order-statuses"
import { AlertTriangle, ChevronRight, ExternalLink, MessageSquare } from "lucide-react"
import { PrintIconButton } from "@/components/print-icon-button"
import { OrderStatusSelect } from "@/components/order-status-select"
import { OrderItemsEditor } from "@/components/order-items-editor"
import { OrderMaterials } from "@/components/order-materials"
import { DateField, NotesField, PriorityField, TextField } from "@/components/order-props-editor"
import { getCostedProducts } from "@/lib/costed-products"

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

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[86px_1fr] items-center gap-2 py-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="text-sm min-w-0">{children}</div>
        </div>
    )
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
    const id = Number.parseInt(params.id, 10)
    if (!Number.isFinite(id)) notFound()

    const order = await readOrder(id)
    if (!order) notFound()

    const [needs, vocab, costed] = await Promise.all([
        materialNeeds(id),
        getSpecs(),
        getCostedProducts(),
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

    const sinMateriales = order.items.filter((i) => i.needs_review)

    return (
        <div className="w-full px-8 py-6">
            <div className="flex items-center justify-between gap-4 mb-5 no-print">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
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
                    <section>
                        <h1 className="text-sm font-medium text-muted-foreground mb-2">Qué armar</h1>
                        <OrderItemsEditor
                            orderId={order.id}
                            items={order.items.map((i) => ({
                                id: i.id,
                                product: i.product,
                                quantity: i.quantity,
                                specs: i.specs,
                                needs_review: i.needs_review,
                            }))}
                            vocab={vocab}
                            products={costed.map((p) => p.name)}
                        />
                    </section>

                    {/* 2. Qué buscar al depósito, con su estado de stock */}
                    <OrderMaterials orderId={order.id} needs={needs} />

                    {/* 3. Avisos, al final */}
                    {sinMateriales.length > 0 && (
                        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                            <h2 className="flex items-center gap-2 text-sm font-medium text-destructive mb-1">
                                <AlertTriangle className="h-4 w-4" />
                                Sin lista de materiales
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                <strong className="text-foreground">
                                    {sinMateriales.map((i) => i.product).join(", ")}
                                </strong>{" "}
                                no tiene cargada su lista de materiales, así que no aparece en la lista de
                                arriba. Hay que descontarlo de forma manual.
                            </p>
                        </section>
                    )}

                </div>

                {/* ---------- Propiedades ---------- */}
                <aside className="lg:border-l lg:pl-5 lg:sticky lg:top-4">
                    {order.source_conversation && (
                        <a
                            href={order.source_conversation}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-md border px-2.5 py-2 mb-3 text-sm hover:bg-muted/50 transition-colors no-print"
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
                        <div className="hidden print:block rounded-md bg-muted/50 p-2.5 text-sm mb-3">
                            {order.notes}
                        </div>
                    )}

                    <Prop label="Estado">
                        <div className="-ml-1.5 no-print">
                            <OrderStatusSelect id={order.id} status={order.status} />
                        </div>
                        <span className="hidden print:inline">{STATUS_LABELS[order.status]}</span>
                    </Prop>

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
                            <TextField
                                id={order.id}
                                value={order.customer_name}
                                field="customer_name"
                                placeholder="Sin nombre"
                                label="Cliente"
                            />
                        </span>
                        <span className="hidden print:inline">{order.customer_name ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground truncate px-1.5 -ml-1.5">
                            {order.customer_external_id}
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
                        <code className="text-xs text-muted-foreground break-all">{order.external_id}</code>
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
