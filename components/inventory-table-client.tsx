"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Copy } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EditMaterialDialog } from "./edit-material-dialog"
import { formatCurrencyUSD } from "@/lib/formatters"

interface InventoryTableClientProps {
    items: any[]
    categories: any[]
    suppliers: any[]
    userRole?: string
}

export function InventoryTableClient({ items, categories, suppliers, userRole }: InventoryTableClientProps) {
    const [editingMaterial, setEditingMaterial] = useState<any>(null)
    const router = useRouter()

    const copyCode = async (e: React.MouseEvent, code: string) => {
        e.stopPropagation() // no navegar al detalle al copiar
        if (!code) return
        try {
            await navigator.clipboard.writeText(code)
            toast.success("Código copiado", { description: code })
        } catch {
            toast.error("No se pudo copiar el código")
        }
    }

    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Material</th>
                            <th className="text-center py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Código</th>
                            <th className="text-center py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Stock</th>
                            <th className="text-center py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Estado</th>
                            <th className="text-center py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Categoría</th>
                            {userRole === "admin" && (
                                <>
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Precio Unit. (USD)</th>
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Valor Total (USD)</th>
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">Acciones</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => {
                            const stockLevel =
                                item.current_stock <= item.min_stock
                                    ? "low"
                                    : item.current_stock >= item.max_stock
                                        ? "high"
                                        : "normal"

                            return (
                                <tr
                                    key={item.id}
                                    className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => router.push(`/materials/${item.id}`)}
                                >
                                    <td className="py-3 px-3">
                                        <div>
                                            <div className="font-medium text-foreground">{item.name}</div>
                                            <div className="text-sm text-muted-foreground">{item.supplier_name}</div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => copyCode(e, item.barcode)}>
                                        <button
                                            type="button"
                                            title="Copiar código"
                                            className="group inline-flex items-center gap-1 font-mono text-sm hover:text-primary"
                                        >
                                            {item.barcode}
                                            <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                                        </button>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                        <div className="text-sm">
                                            <div className="font-medium">{item.current_stock}</div>
                                            {item.reserved_stock > 0 && (
                                                <div className="text-muted-foreground">Reservado: {item.reserved_stock}</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                        <Badge
                                            variant={
                                                stockLevel === "low"
                                                    ? "destructive"
                                                    : stockLevel === "high"
                                                        ? "secondary"
                                                        : "default"
                                            }
                                        >
                                            {stockLevel === "low" ? "Stock Bajo" : stockLevel === "high" ? "Stock Alto" : "Normal"}
                                        </Badge>
                                    </td>
                                    <td className="py-3 px-3 text-center text-sm text-muted-foreground">{item.category_name}</td>
                                    {userRole === "admin" && (
                                        <>
                                            <td className="py-3 px-3 text-right text-sm whitespace-nowrap">
                                                {formatCurrencyUSD(Number(item.unit_cost))}
                                            </td>
                                            <td className="py-3 px-3 text-right text-sm font-medium whitespace-nowrap">
                                                {formatCurrencyUSD(Number(item.current_stock) * Number(item.unit_cost))}
                                            </td>
                                            <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setEditingMaterial(item)}
                                                        title="Editar"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {editingMaterial && (
                <EditMaterialDialog
                    material={editingMaterial}
                    categories={categories}
                    suppliers={suppliers}
                    open={!!editingMaterial}
                    onOpenChange={(open) => !open && setEditingMaterial(null)}
                />
            )}
        </>
    )
}
