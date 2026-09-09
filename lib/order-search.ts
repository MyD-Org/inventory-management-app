// Buscador de pedidos: una sola caja que matchea contra TODO lo que identifica a
// un pedido —número, cliente, estado, productos—, sin que haya que aclararle al
// usuario por dónde buscar. Vive acá y no adentro de la vista porque es lógica
// pura y se testea sola.
//
// Sin importaciones de servidor: lo usa un client component (ver el comentario
// de lib/order-statuses.ts, que importa por el mismo motivo).

import { STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"

export interface SearchableOrder {
    order_number: number
    customer_name: string | null
    customer_external_id: string
    /** Código externo del pedido (orden de compra del cliente, expediente). */
    reference: string | null
    status: OrderStatus
    items: { product: string }[]
}

// Sin tildes y en minúscula: "facturación" y "facturacion" son la misma palabra
// para quien busca, y nadie pone tildes apurado.
function normalize(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
}

// Todo lo que identifica al pedido, aplanado en un solo texto. Entra también la
// referencia: el código del otro lado es justamente por donde busca quien llega
// con la orden de compra del cliente en la mano. El estado entra DOS veces: la etiqueta que se ve ("Preparando entrega") y la clave cruda
// ("por facturar"), porque en el taller se lo sigue nombrando por la clave.
function haystack(o: SearchableOrder): string {
    return normalize(
        [
            String(o.order_number),
            o.customer_name ?? "",
            o.customer_external_id,
            o.reference ?? "",
            STATUS_LABELS[o.status] ?? "",
            o.status.replace(/_/g, " "),
            ...o.items.map((i) => i.product),
        ].join(" ")
    )
}

// Cada palabra tiene que aparecer en algún lado, no necesariamente en el mismo
// campo: "cancelado perez" encuentra los pedidos cancelados de Pérez, y "fuente
// 24v" tolera que el producto se llame "Fuente switching 24V".
//
// El "#" se descarta: se escribe "#128" para hablar de un pedido pero el número
// guardado es 128.
export function matchesOrderQuery(order: SearchableOrder, query: string): boolean {
    const tokens = normalize(query).replace(/#/g, "").split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return true
    const hay = haystack(order)
    return tokens.every((t) => hay.includes(t))
}
