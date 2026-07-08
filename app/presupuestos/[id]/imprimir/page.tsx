import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { formatArs } from "@/lib/format"
import { quoteTotals, lineNet } from "@/lib/quote-calc"
import { PrintBar } from "@/components/print-button"

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
    draft: "Borrador",
    sent: "Enviado",
    accepted: "Aceptado",
    rejected: "Rechazado",
}

export default async function PrintQuotePage({ params }: { params: { id: string } }) {
    const session = await auth();
    if (!session?.user) redirect('/login')

    const quoteId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(quoteId)) notFound()

    const [quoteRows, items] = await Promise.all([
        sql`SELECT * FROM quotes WHERE id = ${quoteId}`,
        sql`SELECT * FROM quote_items WHERE quote_id = ${quoteId} ORDER BY id ASC`,
    ])

    const q = quoteRows[0]
    if (!q) notFound()

    const lines = items.map((it) => ({
        qty: Number(it.qty),
        unitPrice: Number(it.unit_price),
        discountPct: Number(it.discount_pct),
        taxPct: Number(it.tax_pct),
    }))
    const totals = quoteTotals(lines)
    const date = new Date(q.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })

    return (
        <div className="min-h-screen bg-white text-black">
            <div className="max-w-3xl mx-auto p-8 print:p-0">
                <PrintBar backHref={`/presupuestos/${quoteId}`} />

                {/* Encabezado */}
                <div className="flex items-start justify-between border-b border-gray-300 pb-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">New Avantec</h1>
                        <p className="text-sm text-gray-500">Fabricación y montaje</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-xl font-semibold">Cotización</h2>
                        <p className="text-sm text-gray-500">N° {q.id}</p>
                        <p className="text-sm text-gray-500">{date}</p>
                    </div>
                </div>

                {/* Cliente + título */}
                <div className="mb-6">
                    <p className="text-sm text-gray-500">Cliente</p>
                    <p className="font-medium">{q.customer_name || "—"}</p>
                    <p className="mt-2 text-lg font-semibold">{q.title}</p>
                    <p className="text-sm text-gray-500">Estado: {STATUS_LABELS[q.status] ?? q.status}</p>
                </div>

                {/* Ítems */}
                <table className="w-full text-sm mb-6">
                    <thead>
                        <tr className="border-b border-gray-300 text-left text-gray-500">
                            <th className="py-2">Producto</th>
                            <th className="py-2">Descripción</th>
                            <th className="py-2 text-right w-14">Cant.</th>
                            <th className="py-2 text-right w-24">Precio</th>
                            <th className="py-2 text-right w-14">Desc.</th>
                            <th className="py-2 text-right w-14">IVA</th>
                            <th className="py-2 text-right w-28">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it) => {
                            const l = {
                                qty: Number(it.qty),
                                unitPrice: Number(it.unit_price),
                                discountPct: Number(it.discount_pct),
                                taxPct: Number(it.tax_pct),
                            }
                            return (
                                <tr key={it.id} className="border-b border-gray-100 align-top">
                                    <td className="py-2">
                                        {it.label}
                                        {it.reference ? <span className="block text-xs text-gray-400">Ref: {it.reference}</span> : null}
                                    </td>
                                    <td className="py-2 text-gray-600 whitespace-pre-wrap">{it.description || "—"}</td>
                                    <td className="py-2 text-right">{l.qty}</td>
                                    <td className="py-2 text-right">{formatArs(l.unitPrice)}</td>
                                    <td className="py-2 text-right">{l.discountPct ? `${l.discountPct}%` : "—"}</td>
                                    <td className="py-2 text-right">{l.taxPct ? `${l.taxPct}%` : "—"}</td>
                                    <td className="py-2 text-right">{formatArs(lineNet(l))}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                {/* Totales */}
                <div className="flex justify-end">
                    <div className="w-64 space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Subtotal (bruto)</span>
                            <span>{formatArs(totals.gross)}</span>
                        </div>
                        {totals.discount > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Descuento</span>
                                <span>-{formatArs(totals.discount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-gray-500">Neto</span>
                            <span>{formatArs(totals.subtotal)}</span>
                        </div>
                        {totals.tax > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Impuestos</span>
                                <span>+{formatArs(totals.tax)}</span>
                            </div>
                        )}
                        <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-bold">
                            <span>Total</span>
                            <span>{formatArs(totals.total)}</span>
                        </div>
                    </div>
                </div>

                {/* Notas */}
                {q.notes && (
                    <div className="mt-8 text-sm">
                        <p className="text-gray-500 mb-1">Notas y condiciones</p>
                        <p className="whitespace-pre-wrap">{q.notes}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
