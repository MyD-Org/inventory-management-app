import { SuppliersTable } from "@/components/suppliers-table"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
    const session = await auth();

    if (session?.user?.role !== 'admin') {
        redirect('/')
    }

    const suppliers = await sql`SELECT * FROM suppliers ORDER BY name ASC`

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-2xl font-bold mb-6">Gestión de Proveedores</h1>
                    <SuppliersTable suppliers={suppliers.map(s => ({
                        id: s.id,
                        name: s.name,
                        contact_info: s.address || s.contact_info || s.email || s.phone
                    }))} />
                </div>
            </main>
        </div>
    )
}
