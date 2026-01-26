"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { useState } from "react"
import { downloadInventoryReport } from "@/lib/actions"
import { toast } from "sonner"

export function DownloadReportButton() {
    const [loading, setLoading] = useState(false)

    const handleDownload = async () => {
        setLoading(true)
        try {
            const data = await downloadInventoryReport()
            if (!data || data.length === 0) {
                toast.error("No hay datos para exportar")
                return
            }

            // Convert to CSV
            const headers = ["Código", "Nombre", "Categoría", "Proveedor", "Stock Actual", "Unidad", "Costo Unitario", "Valor Total"]
            const csvContent = [
                headers.join(","),
                ...data.map((row: any) => [
                    row.barcode || "",
                    `"${(row.name || "").replace(/"/g, '""')}"`, // Escape quotes
                    `"${(row.category || "").replace(/"/g, '""')}"`,
                    `"${(row.supplier || "").replace(/"/g, '""')}"`,
                    row.current_stock,
                    row.unit_of_measure || "",
                    row.unit_cost || 0,
                    row.total_value || 0
                ].join(","))
            ].join("\n")

            // Create blob and download
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.setAttribute("href", url)
            link.setAttribute("download", `inventario_${new Date().toISOString().split('T')[0]}.csv`)
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            toast.success("Reporte descargado correctamente")
        } catch (error) {
            console.error(error)
            toast.error("Error al descargar el reporte")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button variant="outline" onClick={handleDownload} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            {loading ? "Generando..." : "Descargar Excel (CSV)"}
        </Button>
    )
}
