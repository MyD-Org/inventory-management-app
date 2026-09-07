import { redirect } from "next/navigation"
import { QuoteEditor } from "@/components/quote-editor"
import { auth } from "@/auth"
import { getCostedProducts } from "@/lib/costed-products"
import { isAlegraConfigured } from "@/lib/alegra"

export const dynamic = 'force-dynamic';

export default async function NewQuotePage() {
    const session = await auth();
    if (!session?.user) redirect('/login')
    // Fichas y presupuestos son solo de admin: muestran costos, márgenes y precios.
    if (session.user.role !== 'admin') redirect('/')

    const products = await getCostedProducts()

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6">
                <QuoteEditor quote={null} products={products} heading="Nuevo Presupuesto" alegraEnabled={isAlegraConfigured()} />
            </main>
        </div>
    )
}
