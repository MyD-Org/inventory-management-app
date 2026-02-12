import { Suspense } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { InventoryTable } from "@/components/inventory-table"
import { DownloadReportButton } from "@/components/download-report-button"

export const dynamic = "force-dynamic"

export default function InventoryPage({
    searchParams,
}: {
    searchParams: { search?: string; category?: string; status?: string }
}) {
    return (
        <div className="min-h-screen bg-background">
            <DashboardHeader />

            <main className="container mx-auto px-4 py-6">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-2xl font-bold">Inventario Completo</h1>
                    <DownloadReportButton />
                </div>
                <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
                    <InventoryTable searchParams={searchParams} />
                </Suspense>
            </main>
        </div>
    )
}
