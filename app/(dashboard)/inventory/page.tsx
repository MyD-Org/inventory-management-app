import { Suspense } from "react"
import Link from "next/link"
import { Upload } from "lucide-react"
import { InventoryTable } from "@/components/inventory-table"
import { DownloadReportButton } from "@/components/download-report-button"
import { Button } from "@/components/ui/button"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

export default async function InventoryPage({
    searchParams,
}: {
    searchParams: { search?: string; category?: string; status?: string }
}) {
    const session = await auth()
    const isAdmin = session?.user?.role === "admin"

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-2xl font-bold">Inventario Completo</h1>
                    <div className="flex flex-wrap items-center gap-2">
                        {isAdmin && (
                            <Button asChild variant="outline">
                                <Link href="/settings/bulk-update">
                                    <Upload className="mr-2 h-4 w-4" />
                                    Importar
                                </Link>
                            </Button>
                        )}
                        <DownloadReportButton />
                    </div>
                </div>
                <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-lg" />}>
                    <InventoryTable searchParams={searchParams} />
                </Suspense>
            </main>
        </div>
    )
}
