import Link from "next/link"
import { notFound } from "next/navigation"
import { getSpecs, missingMaterials, readOrder } from "@/lib/orders"
import { STATUS_LABELS } from "@/lib/order-statuses"
import { AlertTriangle, ChevronRight, ExternalLink, MessageSquare, PackageX, Phone } from "lucide-react"
import { PrintIconButton } from "@/components/print-icon-button"
import { OrderStatusSelect } from "@/components/order-status-select"
import { PriorityIcon } from "@/components/order-glyphs"

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

    // Specs en el orden del vocabulario y solo los valores: "ámbar · grampa larga · 25°"
    // se lee de corrido, mientras que con etiquetas ocupa el triple.
    const specsLine = (specs: Record<string, string>) =>
        Object.keys(vocab)
            .filter((k) => specs[k])
            .map((k) => specs[k])
            .join(" · ")

    const unanswered = (specs: Record<string, string>) =>
        Object.entries(vocab).filter(([k, f]) => !f.free_text && !specs[k])

    // Materiales del pedido ENTERO, sumados. Al taller le sirve una sola lista
    // para ir a buscar al depósito, no una por línea: si dos productos llevan la
    // misma óptica, quiere el total.
    const totales = new Map<string, { label: string; qty: number }>()
    for (const item of order.items) {
        for (const m of item.materials) {
            const key = String(m.material_id ?? m.label)
            const prev = totales.get(key)
            totales.set(key, { label: m.label, qty: (prev?.qty ?? 0) + m.qty_total })
        }
    }
    const materiales = Array.from(totales.values()).sort((a, b) => a.label.localeCompare(b.label))
    const sinReceta = order.items.filter((i) => i.needs_review)

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
                <PrintIconButton />
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_250px] items-start">
                {/* ---------- El trabajo ---------- */}
                <div className="min-w-0 space-y-7">
                    {/* 1. Qué armar */}
                    <section>
                        <h1 className="text-[13px] font-medium text-muted-foreground mb-2">Qué armar</h1>
                        <div className="border rounded-lg divide-y">
                            {order.items.map((item) => {
                                const faltan = unanswered(item.specs)
                                const linea = specsLine(item.specs)
                                return (
                                    <div key={item.id} className="flex items-baseline gap-4 px-4 py-3.5">
                                        <span className="text-3xl font-semibold tabular-nums leading-none w-14 shrink-0">
                                            {item.quantity}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[17px] font-medium leading-tight">
                                                {item.product}
                                            </div>
                                            {linea && (
                                                <div className="text-[14px] text-muted-foreground mt-0.5">
                                                    {linea}
                                                </div>
                                            )}
                                            {faltan.length > 0 && (
                                                <div className="flex gap-1.5 flex-wrap mt-2">
                                                    {faltan.map(([k, f]) => (
                                                        <span
                                                            key={k}
                                                            className="rounded border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground"
                                                        >
                                                            {f.label}: sin confirmar
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>

                    {/* 2. Qué buscar al depósito */}
                    {materiales.length > 0 && (
                        <section>
                            <h2 className="text-[13px] font-medium text-muted-foreground mb-2">
                                Materiales que necesitás
                            </h2>
                            <div className="border rounded-lg divide-y">
                                {materiales.map((m) => (
                                    <div key={m.label} className="flex items-center gap-4 px-4 py-2">
                                        <span className="text-[15px] font-semibold tabular-nums w-14 shrink-0">
                                            {m.qty}
                                        </span>
                                        <span className="text-[14px] min-w-0 flex-1 truncate">{m.label}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[12px] text-muted-foreground mt-2">
                                Total del pedido, sumando todas las líneas. Congelado al crearlo.
                            </p>
                        </section>
                    )}

                    {/* 3. Avisos, al final */}
                    {sinReceta.length > 0 && (
                        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                            <h2 className="flex items-center gap-2 text-[13px] font-medium text-destructive mb-1">
                                <AlertTriangle className="h-4 w-4" />
                                {sinReceta.length === 1 ? "Un producto sin receta" : `${sinReceta.length} productos sin receta`}
                            </h2>
                            <p className="text-[13px] text-muted-foreground">
                                {sinReceta.map((i) => i.product).join(", ")} no tiene hoja de costo, así que sus
                                materiales no están en la lista de arriba. Cargala en{" "}
                                <strong className="text-foreground">Calcular Costos</strong> o resolvelo a mano.
                            </p>
                        </section>
                    )}

                    {missing.length > 0 && (
                        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                            <h2 className="flex items-center gap-2 text-[13px] font-medium text-destructive mb-2">
                                <PackageX className="h-4 w-4" />
                                Falta stock para armarlo
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
                                        <span className="text-destructive font-medium tabular-nums w-14 text-right">
                                            −{m.missing}
                                        </span>
                                    </div>
                                ))}
                            </div>
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
                            className="flex items-center gap-2 rounded-md border px-2.5 py-2 mb-3 text-[13px] hover:bg-muted/50 transition-colors no-print"
                        >
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="flex-1 min-w-0 truncate">Ver la conversación</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                        </a>
                    )}

                    {order.notes && (
                        <div className="rounded-md bg-muted/50 p-2.5 text-[13px] mb-3">{order.notes}</div>
                    )}

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
                        <code className="text-[11px] text-muted-foreground break-all">{order.external_id}</code>
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
