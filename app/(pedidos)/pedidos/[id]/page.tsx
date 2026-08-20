import { notFound } from "next/navigation"
import { missingMaterials, readOrder, STATUS_LABELS } from "@/lib/orders"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, CalendarClock, ExternalLink, PackageX } from "lucide-react"
import { PrintBar } from "@/components/print-button"
import { OrderStatusSelect } from "@/components/order-status-select"

export const dynamic = 'force-dynamic';

// Orden de trabajo del taller: qué hay que fabricar y qué materiales preparar.
// El BOM es el SNAPSHOT tomado al crear el pedido, no la receta vigente: si la
// hoja de costo cambió después, acá se sigue viendo lo que se pidió.
// Sin importes: este módulo no maneja plata.
export default async function OrderDetailPage({ params }: { params: { id: string } }) {
    const id = Number.parseInt(params.id, 10)
    if (!Number.isFinite(id)) notFound()

    const order = await readOrder(id)
    if (!order) notFound()

    const missing = await missingMaterials(id)

    return (
        <div className="container mx-auto px-4 py-6 max-w-4xl">
            <PrintBar backHref="/pedidos" />

            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">Pedido #{order.order_number}</h1>
                    <p className="text-sm text-muted-foreground">
                        {order.customer_name ?? "Sin nombre"} · {order.customer_external_id}
                        {order.customer_phone && ` · ${order.customer_phone}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {order.origin} · <code>{order.external_id}</code>
                    </p>
                </div>
                <div className="text-right space-y-1">
                    <div className="no-print"><OrderStatusSelect id={order.id} status={order.status} /></div>
                    <div className="hidden print:block"><Badge>{STATUS_LABELS[order.status]}</Badge></div>
                    {order.priority === "alta" && (
                        <div><Badge variant="destructive">Urgente</Badge></div>
                    )}
                    {order.delivery_date_estimate && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            <CalendarClock className="h-3 w-3" />
                            Entrega {new Date(order.delivery_date_estimate).toLocaleDateString("es-AR")}
                        </div>
                    )}
                </div>
            </div>

            {order.source_conversation && (
                <a
                    href={order.source_conversation}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-6 no-print"
                >
                    <ExternalLink className="h-4 w-4" />
                    Ver qué pidió el cliente en el CRM
                </a>
            )}

            {order.notes && <p className="text-sm bg-muted rounded-md p-3 mb-6">{order.notes}</p>}

            {missing.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 mb-6">
                    <h2 className="flex items-center gap-2 font-semibold text-destructive mb-3">
                        <PackageX className="h-4 w-4" />
                        Falta material para armar este pedido
                    </h2>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Material</TableHead>
                                <TableHead className="text-right">Necesita</TableHead>
                                <TableHead className="text-right">Hay</TableHead>
                                <TableHead className="text-right">Falta</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {missing.map((m) => (
                                <TableRow key={m.material_id ?? m.label}>
                                    <TableCell>{m.label}</TableCell>
                                    <TableCell className="text-right tabular-nums">{m.required}</TableCell>
                                    <TableCell className="text-right tabular-nums">{m.available}</TableCell>
                                    <TableCell className="text-right tabular-nums font-medium text-destructive">
                                        {m.missing}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            <div className="space-y-6">
                {order.items.map((item) => (
                    <div key={item.id} className="rounded-md border p-4">
                        <div className="mb-3">
                            <h2 className="font-semibold">
                                {item.quantity} × {item.product}
                            </h2>
                            {Object.entries(item.specs).filter(([, v]) => v !== "").length > 0 && (
                                <div className="flex gap-2 flex-wrap mt-2">
                                    {Object.entries(item.specs)
                                        .filter(([, v]) => v !== "")
                                        .map(([k, v]) => (
                                            <Badge key={k} variant="secondary">
                                                {k}: {String(v)}
                                            </Badge>
                                        ))}
                                </div>
                            )}
                        </div>

                        {item.needs_review ? (
                            <div className="flex items-start gap-2 text-sm bg-destructive/10 text-destructive rounded-md p-3">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>
                                    No hay hoja de costo para este producto, así que no se pudo armar la lista
                                    de materiales. Cargala en <strong>Calcular Costos</strong> o resolvelo a mano.
                                </span>
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Materiales a preparar (congelados al crear el pedido)
                                </p>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Material</TableHead>
                                            <TableHead className="text-right">Por unidad</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {item.materials.map((m, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{m.label}</TableCell>
                                                <TableCell className="text-right text-muted-foreground tabular-nums">
                                                    {m.qty_per_unit}
                                                </TableCell>
                                                <TableCell className="text-right font-medium tabular-nums">
                                                    {m.qty_total}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
