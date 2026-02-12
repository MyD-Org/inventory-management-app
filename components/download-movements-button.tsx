"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { downloadMovementsReport } from "@/lib/actions"
import { useSearchParams } from "next/navigation"

function formatCsvValue(value: string | number | null | undefined) {
    if (value === null || value === undefined) return ""
    const text = String(value)
    if (text.includes('"') || text.includes(",") || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`
    }
    return text
}

export function DownloadMovementsButton() {
    const [loading, setLoading] = useState(false)
    const searchParams = useSearchParams()

    const handleDownload = async () => {
        setLoading(true)
        try {
            const data = await downloadMovementsReport({
                search: searchParams.get("search") || undefined,
                type: searchParams.get("type") || undefined,
                from: searchParams.get("from") || undefined,
                to: searchParams.get("to") || undefined,
            })

            if (!data || data.length === 0) {
                toast.error("No hay movimientos para exportar con los filtros actuales")
                return
            }

            const headers = [
                "Fecha",
                "Tipo",
                "Cantidad",
                "Material",
                "Código",
                "Categoría",
                "Usuario",
                "Referencia",
                "Notas",
                "Stock Anterior",
                "Stock Nuevo",
            ]

            const csvContent = [
                headers.join(","),
                ...data.map((row: any) =>
                    [
                        formatCsvValue(new Date(row.created_at).toISOString()),
                        formatCsvValue(row.movement_type),
                        formatCsvValue(row.quantity),
                        formatCsvValue(row.material_name),
                        formatCsvValue(row.barcode),
                        formatCsvValue(row.category_name),
                        formatCsvValue(row.user_name),
                        formatCsvValue(row.reference_number),
                        formatCsvValue(row.notes),
                        formatCsvValue(row.previous_stock),
                        formatCsvValue(row.new_stock),
                    ].join(",")
                ),
            ].join("\n")

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.setAttribute("href", url)
            link.setAttribute("download", `movimientos_${new Date().toISOString().split("T")[0]}.csv`)
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            toast.success("Reporte de movimientos descargado correctamente")
        } catch (error) {
            console.error(error)
            toast.error("Error al descargar el reporte de movimientos")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button variant="outline" onClick={handleDownload} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            {loading ? "Generando..." : "Descargar Movimientos (CSV)"}
        </Button>
    )
}
