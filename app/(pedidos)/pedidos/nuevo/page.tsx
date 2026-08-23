import { getSpecs } from "@/lib/orders"
import { getCostedProducts } from "@/lib/costed-products"
import { NewOrderPage } from "@/components/new-order-page"

export const dynamic = 'force-dynamic';

// Alta manual, para los pedidos que no entran por el bot (mostrador, teléfono).
// Misma pantalla que el detalle, para no aprender dos interfaces distintas.
export default async function NuevoPedidoPage() {
    const [specs, products] = await Promise.all([getSpecs(), getCostedProducts()])
    return <NewOrderPage specs={specs} products={products.map((p) => p.name)} />
}
