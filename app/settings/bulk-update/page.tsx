import { DashboardHeader } from "@/components/dashboard-header"
import { InventoryImporter } from "@/components/inventory-importer"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function BulkUpdatePage() {
    const session = await auth()

    if (session?.user?.role !== 'admin') {
        redirect('/settings')
    }

    return (
        <div className="min-h-screen bg-background">
            <DashboardHeader user={session?.user} />
            <main className="container mx-auto px-4 py-6">
                <h1 className="text-2xl font-bold mb-6">Actualización Masiva de Inventario</h1>
                <InventoryImporter />
            </main>
        </div>
    )
}
