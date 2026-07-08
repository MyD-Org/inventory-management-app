import { CategoriesTable } from "@/components/categories-table"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
    const session = await auth();

    if (session?.user?.role !== 'admin') {
        redirect('/')
    }

    const categories = await sql`SELECT * FROM categories ORDER BY name ASC`

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-2xl font-bold mb-6">Gestión de Categorías</h1>
                    <CategoriesTable categories={categories.map(c => ({
                        id: c.id,
                        name: c.name,
                        description: c.description
                    }))} />
                </div>
            </main>
        </div>
    )
}
