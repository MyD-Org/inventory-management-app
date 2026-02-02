import { sql } from "@/lib/database"
import { DashboardHeader } from "@/components/dashboard-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
    Package, 
    Barcode, 
    Tag, 
    Truck, 
    Scale, 
    DollarSign, 
    History, 
    TrendingUp,
    TrendingDown,
    RotateCcw
} from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/auth"

async function getMaterialDetail(id: string) {
    try {
        const result = await sql`
            SELECT 
                m.*, 
                c.name as category_name, 
                s.name as supplier_name,
                i.current_stock,
                i.available_stock,
                i.reserved_stock,
                i.last_updated
            FROM materials m
            JOIN inventory i ON m.id = i.material_id
            LEFT JOIN categories c ON m.category_id = c.id
            LEFT JOIN suppliers s ON m.supplier_id = s.id
            WHERE m.id = ${id}
        `
        return result[0]
    } catch (error) {
        console.error("Error fetching material detail:", error)
        return null
    }
}

async function getMaterialMovements(id: string) {
    try {
        const movements = await sql`
            SELECT * FROM stock_movements 
            WHERE material_id = ${id} 
            ORDER BY created_at DESC
        `
        return movements
    } catch (error) {
        console.error("Error fetching movements:", error)
        return []
    }
}

export default async function MaterialDetailPage({ params }: { params: { id: string } }) {
    const session = await auth()
    const material = await getMaterialDetail(params.id)
    
    if (!material) {
        notFound()
    }

    const movements = await getMaterialMovements(params.id)

    const stockLevel =
        material.current_stock <= material.min_stock
            ? "low"
            : material.current_stock >= material.max_stock
                ? "high"
                : "normal"

    return (
        <div className="min-h-screen bg-background">
            <DashboardHeader user={session?.user} />
            
            <main className="container mx-auto px-4 py-6 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{material.name}</h1>
                    <p className="text-muted-foreground font-mono text-sm">{material.barcode}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Información Principal */}
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Package className="w-5 h-5 text-primary" />
                                Detalles del Producto
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <Tag className="w-4 h-4 mt-1 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground uppercase">Categoría</p>
                                        <p className="text-sm font-semibold">{material.category_name || "Sin categoría"}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Truck className="w-4 h-4 mt-1 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground uppercase">Proveedor</p>
                                        <p className="text-sm font-semibold">{material.supplier_name || "Sin proveedor"}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Scale className="w-4 h-4 mt-1 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground uppercase">Unidad de Medida</p>
                                        <p className="text-sm font-semibold">{material.unit_of_measure}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <DollarSign className="w-4 h-4 mt-1 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground uppercase">Costo Unitario</p>
                                        <p className="text-sm font-semibold">${Number(material.unit_cost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Barcode className="w-4 h-4 mt-1 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground uppercase">Código de Barras</p>
                                        <p className="text-sm font-mono font-semibold">{material.barcode}</p>
                                    </div>
                                </div>
                            </div>

                            {material.description && (
                                <div className="sm:col-span-2 pt-4 border-t">
                                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Descripción</p>
                                    <p className="text-sm text-foreground leading-relaxed">{material.description}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Estado del Stock */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Scale className="w-5 h-5 text-primary" />
                                Estado de Stock
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="text-center p-4 bg-muted rounded-xl">
                                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Stock Actual</p>
                                <p className="text-4xl font-bold">{material.current_stock}</p>
                                <Badge 
                                    className="mt-2"
                                    variant={stockLevel === "low" ? "destructive" : stockLevel === "high" ? "secondary" : "default"}
                                >
                                    {stockLevel === "low" ? "Stock Bajo" : stockLevel === "high" ? "Stock Alto" : "Normal"}
                                </Badge>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Disponible:</span>
                                    <span className="font-semibold text-green-600">{material.available_stock}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Reservado:</span>
                                    <span className="font-semibold text-orange-600">{material.reserved_stock}</span>
                                </div>
                                <div className="pt-3 border-t">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>Rango Ideal:</span>
                                        <span>{material.min_stock} - {material.max_stock}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Historial de Movimientos */}
                    <Card className="md:col-span-3">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <History className="w-5 h-5 text-primary" />
                                    Historial de Movimientos
                                </CardTitle>
                                <CardDescription>Últimos 50 movimientos registrados</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-muted-foreground">
                                            <th className="text-left py-3 font-medium">Fecha</th>
                                            <th className="text-left py-3 font-medium">Tipo</th>
                                            <th className="text-center py-3 font-medium">Cantidad</th>
                                            <th className="text-center py-3 font-medium">Stock</th>
                                            <th className="text-left py-3 font-medium">Usuario</th>
                                            <th className="text-left py-3 font-medium">Referencia / Notas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {movements.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="py-8 text-center text-muted-foreground italic">
                                                    No hay movimientos registrados para este producto.
                                                </td>
                                            </tr>
                                        ) : (
                                            movements.map((m: any) => (
                                                <tr key={m.id} className="hover:bg-muted/50">
                                                    <td className="py-3">
                                                        {new Date(m.created_at).toLocaleDateString("es-AR", {
                                                            day: "2-digit",
                                                            month: "2-digit",
                                                            year: "2-digit",
                                                            hour: "2-digit",
                                                            minute: "2-digit"
                                                        })}
                                                    </td>
                                                    <td className="py-3">
                                                        <div className="flex items-center gap-2">
                                                            {m.movement_type === "entrada" ? (
                                                                <TrendingUp className="w-3 h-3 text-green-600" />
                                                            ) : m.movement_type === "salida" ? (
                                                                <TrendingDown className="w-3 h-3 text-red-600" />
                                                            ) : (
                                                                <RotateCcw className="w-3 h-3 text-blue-600" />
                                                            )}
                                                            <span className="capitalize">{m.movement_type}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 text-center">
                                                        <Badge variant={m.movement_type === "entrada" ? "default" : m.movement_type === "salida" ? "destructive" : "secondary"}>
                                                            {m.movement_type === "entrada" ? "+" : m.movement_type === "salida" ? "-" : "±"}
                                                            {Math.abs(m.quantity)}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 text-center font-mono text-xs text-muted-foreground">
                                                        {m.previous_stock} → <span className="font-bold text-foreground">{m.new_stock}</span>
                                                    </td>
                                                    <td className="py-3">{m.user_name || "Sistema"}</td>
                                                    <td className="py-3 max-w-xs">
                                                        <div className="font-medium truncate">{m.reference_number || "-"}</div>
                                                        <div className="text-xs text-muted-foreground truncate">{m.notes}</div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
