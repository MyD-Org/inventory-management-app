import { getSpecs, listSellableProducts } from "@/lib/orders"
import { NewOrderPage } from "@/components/new-order-page"

export const dynamic = 'force-dynamic';

// Alta manual, para los pedidos que no entran por el bot (mostrador, teléfono).
// Misma pantalla que el detalle, para no aprender dos interfaces distintas.
export default async function NuevoPedidoPage() {
    // Los productos salen del CATÁLOGO de Alegra, no de las hojas de costo: un
    // producto existe porque se vende, y la hoja es información opcional sobre
    // cómo se fabrica.
    const [specs, products] = await Promise.all([getSpecs(), listSellableProducts()])
    return <NewOrderPage specs={specs} products={products} />
}
