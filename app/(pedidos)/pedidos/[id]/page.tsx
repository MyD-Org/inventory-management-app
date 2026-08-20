import Link from "next/link"
import { notFound } from "next/navigation"
import { getSpecs, missingMaterials, readOrder } from "@/lib/orders"
import { STATUS_LABELS } from "@/lib/order-statuses"
import { AlertTriangle, ChevronRight, ExternalLink, MessageSquare, PackageX, Phone } from "lucide-react"
import { PrintBar } from "@/components/print-button"
import { OrderStatusSelect } from "@/components/order-status-select"
import { PriorityIcon } from "@/components/order-glyphs"

export const dynamic = 'force-dynamic';

// Orden de trabajo del taller, con el layout de dos columnas de Linear:
// el contenido a la izquierda y las propiedades del pedido a la derecha.
//
// El BOM es el SNAPSHOT tomado al crear el pedido, no la receta vigente: si la
// hoja de costo cambió después, acá se sigue viendo lo que se pidió.
// Sin importes: este módulo no maneja plata.

const PRIORITY_LABELS: Record<string, string> = { baja: "Baja", normal: "Normal", alta: "Alta" }

function formatDate(d: string | null): string {
    if (!d) return "—"
    const [y, m, day] = d.split("-").map(Number)
    return new Date(y, m - 1, day).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
}

// Fila de la barra de propiedades: etiqueta tenue a la izquierda, valor a la derecha.
function Prop({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[92px_1fr] items-center gap-2 py-1">
            <span className="text-[12px] text-muted-foreground">{label}</span>
            <div className="text-[13px] min-w-0">{children}</div>
        </div>
    )
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
    const id = Number.parseInt(params.id, 10)
    if (!Number.isFinite(id)) notFound()

    const order = await readOrder(id)
    if (!order) notFound()

    const [missing, vocab] = await Promise.all([missingMaterials(id), getSpecs()])

    // Specs del vocabulario que la línea NO trae: el doc pide que el taller vea
    // "qué falta" cuando el bot cortó la charla a medias. Los campos de texto
    // libre no cuentan: son opcionales por naturaleza.
    const unanswered = (specs: Record<string, string>) =>
        Object.entries(vocab).filter(([k, f]) => !f.free_text && !specs[k])

    return (
        <div className="container mx-auto px-4 py-5 max-w-6xl">
            <div className="flex items-center justify-between gap-4 mb-5 no-print">
                <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground min-w-0">
                    <Link href="/pedidos" className="hover:text-foreground">
                        Pedidos
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-foreground tabular-nums">#{order.order_number}</span>
                </div>
                <PrintBar backHref="/pedidos" />
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_260px] items-start">
                {/* ---------- Contenido ---------- */}
                <div className="min-w-0 space-y-5">
                    <h1 className="text-xl font-semibold">
                        {order.customer_name ?? order.customer_external_id}
                    </h1>

                    {order.source_conversation ? (
                        <a
                            href={order.source_conversation}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors no-print"
                        >
                            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium">Leer la conversación original</div>
                                <div className="text-[12px] text-muted-foreground">
                                    Si la comanda parece rara, acá está lo que dijo el cliente textualmente
                                </div>
                            </div>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </a>
                    ) : (
                        <p className="text-[12px] text-muted-foreground no-print">
                            Sin conversación asociada (pedido cargado a mano).
                        </p>
                    )}

                    {order.notes && (
                        <div className="rounded-md bg-muted/50 p-3 text-[13px]">{order.notes}</div>
                    )}

                    {missing.length > 0 && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                            <h2 className="flex items-center gap-2 text-[13px] font-medium text-destructive mb-2">
                                <PackageX className="h-4 w-4" />
                                Falta material para armar este pedido
                            </h2>
                            <div className="divide-y divide-destructive/15">
                                {missing.map((m) => (
                                    <div
                                        key={m.material_id ?? m.label}
                                        className="flex items-center gap-3 py-1.5 text-[13px]"
                                    >
                                        <span className="flex-1 min-w-0 truncate">{m.label}</span>
                                        <span className="text-muted-foreground tabular-nums text-[12px]">
                                            necesita {m.required} · hay {m.available}
                                        </span>
                                        <span className="text-destructive font-medium tabular-nums w-16 text-right">
                                            −{m.missing}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <h2 className="text-[13px] font-medium text-muted-foreground">
                            A fabricar
                        </h2>

                        {order.items.map((item) => {
                            const faltan = unanswered(item.specs)
                            return (
                                <div key={item.id} className="rounded-md border">
                                    <div className="px-3 py-2.5 border-b">
                                        <div className="text-[13px] font-medium">
                                            {item.quantity} × {item.product}
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap mt-2">
                                            {Object.entries(item.specs)
                                                .filter(([, v]) => v !== "")
                                                .map(([k, v]) => (
                                                    <span
                                                        key={k}
                                                        className="rounded border px-1.5 py-0.5 text-[11px] bg-muted/50"
                                                    >
                                                        <span className="text-muted-foreground">
                                                            {vocab[k]?.label ?? k}:
                                                        </span>{" "}
                                                        {String(v)}
                                                    </span>
                                                ))}
                                            {faltan.map(([k, f]) => (
                                                <span
                                                    key={k}
                                                    className="rounded border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground"
                                                >
                                                    {f.label}: sin confirmar
                                                </span>
                                            ))}
                                        </div>
                                        {faltan.length > 0 && (
                                            <p className="text-[12px] text-muted-foreground mt-2">
                                                Falta confirmar {faltan.length}{" "}
                                                {faltan.length === 1 ? "dato" : "datos"} con el cliente.
                                            </p>
                                        )}
                                    </div>

                                    {item.needs_review ? (
                                        <div className="flex items-start gap-2 p-3 text-[13px] text-destructive">
                                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                            <span>
                                                No hay hoja de costo para este producto, así que no se pudo armar
                                                la lista de materiales. Cargala en <strong>Calcular Costos</strong>{" "}
                                                o resolvelo a mano.
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="divide-y">
                                            {item.materials.map((m, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center gap-3 px-3 py-1.5 text-[13px]"
                                                >
                                                    <span className="flex-1 min-w-0 truncate">{m.label}</span>
                                                    <span className="text-[12px] text-muted-foreground tabular-nums">
                                                        {m.qty_per_unit} c/u
                                                    </span>
                                                    <span className="font-medium tabular-nums w-14 text-right">
                                                        {m.qty_total}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* ---------- Propiedades ---------- */}
                <aside className="lg:border-l lg:pl-5 space-y-0.5 lg:sticky lg:top-4">
                    <Prop label="Estado">
                        <div className="-ml-1.5 no-print">
                            <OrderStatusSelect id={order.id} status={order.status} />
                        </div>
                        <span className="hidden print:inline">{STATUS_LABELS[order.status]}</span>
                    </Prop>

                    <Prop label="Prioridad">
                        <span className="flex items-center gap-2">
                            <PriorityIcon priority={order.priority} />
                            {PRIORITY_LABELS[order.priority] ?? order.priority}
                        </span>
                    </Prop>

                    <Prop label="Entrega">{formatDate(order.delivery_date_estimate)}</Prop>

                    <div className="h-px bg-border my-2.5" />

                    <Prop label="Cliente">
                        <span className="block truncate">{order.customer_name ?? "—"}</span>
                        <span className="block text-[12px] text-muted-foreground truncate">
                            {order.customer_external_id}
                        </span>
                    </Prop>

                    {order.customer_phone && (
                        <Prop label="Teléfono">
                            <a
                                href={`tel:${order.customer_phone}`}
                                className="flex items-center gap-1.5 text-primary hover:underline"
                            >
                                <Phone className="h-3 w-3 shrink-0" />
                                {order.customer_phone}
                            </a>
                        </Prop>
                    )}

                    <div className="h-px bg-border my-2.5" />

                    <Prop label="Origen">{order.origin}</Prop>
                    <Prop label="Referencia">
                        <code className="text-[11px] text-muted-foreground break-all">
                            {order.external_id}
                        </code>
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
