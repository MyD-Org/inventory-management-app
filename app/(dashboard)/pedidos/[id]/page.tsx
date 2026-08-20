import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import { readOrder } from "@/lib/orders"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react"

export const dynamic = 'force-dynamic';

function formatArs(n: number): string {
    return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}

// Detalle del pedido con la lista de materiales que tiene que preparar el taller.
// El BOM es el SNAPSHOT tomado al crear el pedido, no la receta vigente: si la
// hoja de costo cambió después, acá se sigue viendo lo que se pidió.
export default async function OrderDetailPage({ params }: { params: { id: string } }) {
    const session = await auth()
    if (!session?.user) redirect('/login')

    const id = Number.parseInt(params.id, 10)
    if (!Number.isFinite(id)) notFound()

    const order = await readOrder(id)
    if (!order) notFound()

    const total = order.items.reduce((s, i) => s + i.qty * i.unit_price, 0)

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6 max-w-5xl">
                <Link href="/pedidos">
                    <Button variant="ghost" size="sm" className="mb-4 -ml-2">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Pedidos
                    </Button>
                </Link>

                <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold">{order.external_id}</h1>
                        <p className="text-sm text-muted-foreground">
                            {order.customer_name ?? "Sin nombre"} · {order.customer_external_id}
                        </p>
                    </div>
                    <div className="text-right">
                        <Badge>{order.customer_status}</Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                            interno: <code>{order.status}</code>
                        </div>
                    </div>
                </div>

                {order.source_conversation && (
                    <a
                        href={order.source_conversation}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-6"
                    >
                        <ExternalLink className="h-4 w-4" />
                        Ver la conversación en el CRM
                    </a>
                )}

                {order.notes && (
                    <p className="text-sm bg-muted rounded-md p-3 mb-6">{order.notes}</p>
                )}

                <div className="space-y-6">
                    {order.items.map((item) => (
                        <div key={item.id} className="rounded-md border p-4">
                            <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                                <div>
                                    <h2 className="font-semibold">
                                        {item.qty} × {item.label}
                                    </h2>
                                    {Object.keys(item.specs).length > 0 && (
                                        <div className="flex gap-2 flex-wrap mt-2">
                                            {Object.entries(item.specs).map(([k, v]) => (
                                                <Badge key={k} variant="secondary">
                                                    {k}: {String(v)}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <div className="font-medium">{formatArs(item.qty * item.unit_price)}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {formatArs(item.unit_price)} c/u
                                    </div>
                                </div>
                            </div>

                            {item.needs_review ? (
                                <div className="flex items-start gap-2 text-sm bg-destructive/10 text-destructive rounded-md p-3">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>
                                        No se encontró una hoja de costo para este producto, así que no hay lista de
                                        materiales. Cargala en <strong>Calcular Costos</strong> y volvé a crear el pedido,
                                        o resolvelo a mano en el taller.
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
                                                    <TableCell className="text-right text-muted-foreground">
                                                        {m.qty_per_unit}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
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

                <div className="flex justify-end mt-6 text-lg font-semibold">
                    Total: {formatArs(total)}
                </div>
            </main>
        </div>
    )
}
