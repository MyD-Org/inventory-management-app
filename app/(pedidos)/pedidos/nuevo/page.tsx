import { getSpecs } from "@/lib/orders"
import { getCostedProducts } from "@/lib/costed-products"
import { OrderEditor } from "@/components/order-editor"

export const dynamic = 'force-dynamic';

// Alta manual, para los pedidos que no entran por el bot (mostrador, teléfono).
// Usa el MISMO vocabulario y la MISMA lógica de creación que la API.
export default async function NewOrderPage() {
    const [specs, products] = await Promise.all([getSpecs(), getCostedProducts()])

    return (
        <div className="container mx-auto px-4 py-6 max-w-3xl">
            <h1 className="text-2xl font-bold mb-1">Nuevo pedido</h1>
            <p className="text-sm text-muted-foreground mb-6">
                La lista de materiales se arma sola desde la hoja de costo de cada producto.
            </p>
            <OrderEditor specs={specs} products={products.map((p) => p.name)} />
        </div>
    )
}
