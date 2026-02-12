"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, Pencil } from "lucide-react"

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

    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left py-2 font-medium text-muted-foreground">Material</th>
                            <th className="text-left py-2 font-medium text-muted-foreground">Código</th>
                            <th className="text-left py-2 font-medium text-muted-foreground">Stock</th>
                            <th className="text-left py-2 font-medium text-muted-foreground">Estado</th>
                            <th className="text-left py-2 font-medium text-muted-foreground">Categoría</th>
                            {userRole === "admin" && (
                                <>
                                    <th className="text-right py-2 font-medium text-muted-foreground">Precio Unit. (USD)</th>
                                    <th className="text-right py-2 font-medium text-muted-foreground">Valor Total (USD)</th>
                                    <th className="text-right py-2 font-medium text-muted-foreground">Acciones</th>
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
                                <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                                    <td className="py-3">
                                        <div>
                                            <div className="font-medium text-foreground">{item.name}</div>
                                            <div className="text-sm text-muted-foreground">{item.supplier_name}</div>
                                        </div>
                                    </td>
                                    <td className="py-3 text-sm font-mono">{item.barcode}</td>
                                    <td className="py-3">
                                        <div className="text-sm">
                                            <div className="font-medium">{item.current_stock}</div>
                                            {item.reserved_stock > 0 && (
                                                <div className="text-muted-foreground">Reservado: {item.reserved_stock}</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3">
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
                                    <td className="py-3 text-sm text-muted-foreground">{item.category_name}</td>
                                    {userRole === "admin" && (
                                        <>
                                            <td className="py-3 text-right text-sm">
                                                {formatCurrencyUSD(Number(item.unit_cost))}
                                            </td>
                                            <td className="py-3 text-right text-sm font-medium">
                                                {formatCurrencyUSD(Number(item.current_stock) * Number(item.unit_cost))}
                                            </td>
                                            <td className="py-3 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => router.push(`/materials/${item.id}`)}
                                                        title="Ver detalle"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
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
