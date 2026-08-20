import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getSpecs } from "@/lib/orders"
import { getCostedProducts } from "@/lib/costed-products"
import { OrderEditor } from "@/components/order-editor"

export const dynamic = 'force-dynamic';

// Carga manual de un pedido. Usa el MISMO vocabulario que ve el bot y la misma
// lógica de creación (lib/orders.ts), así los dos caminos no divergen.
export default async function NewOrderPage() {
    const session = await auth()
    if (!session?.user) redirect('/login')

    const [specs, products] = await Promise.all([getSpecs(), getCostedProducts()])

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6 max-w-4xl">
                <h1 className="text-2xl font-bold mb-1">Nuevo Pedido</h1>
                <p className="text-sm text-muted-foreground mb-6">
                    La lista de materiales se arma sola desde la hoja de costo de cada producto.
                </p>
                <OrderEditor
                    specs={specs}
                    products={products.map((p) => ({ name: p.name, salePrice: p.salePrice }))}
                />
            </main>
        </div>
    )
}
