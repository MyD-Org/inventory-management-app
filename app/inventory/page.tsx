import { Suspense } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { InventoryTable } from "@/components/inventory-table"

export default function InventoryPage({
    searchParams,
}: {
    searchParams: { search?: string; category?: string; status?: string }
}) {
    return (
        <div className="min-h-screen bg-background">
            <DashboardHeader />

            <main className="container mx-auto px-4 py-6">
                <h1 className="text-2xl font-bold mb-6">Inventario Completo</h1>
                <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
                    <InventoryTable searchParams={searchParams} />
                </Suspense>
            </main>
        </div>
    )
}
