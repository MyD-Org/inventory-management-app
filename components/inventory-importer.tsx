"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { previewInventoryUpdates, executeInventoryUpdates } from "@/lib/actions"
import { useRouter } from "next/navigation"
import { formatCurrencyUSD } from "@/lib/formatters"

export function InventoryImporter() {
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState<'upload' | 'preview' | 'success'>('upload')
    const router = useRouter()

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0])
        }
    }

    const parseCSV = async (file: File) => {
        const text = await file.text()
        const lines = text.split('\n')
        const items = []

        // Assume first row is header
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

        const barcodeIndex = headers.findIndex(h => h.toLowerCase().includes('código') || h.toLowerCase().includes('barcode'))
        const stockIndex = headers.findIndex(h => h.toLowerCase().includes('stock actual') || h.toLowerCase().includes('current_stock'))
        const costIndex = headers.findIndex(h => h.toLowerCase().includes('costo unitario') || h.toLowerCase().includes('unit_cost'))

        if (barcodeIndex === -1 || stockIndex === -1) {
            toast.error("El archivo no tiene las columnas requeridas: 'Código' y 'Stock Actual'")
            return []
        }

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue

            // Handle CSV parsing with quotes properly if needed, but simple split for now
            const row = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/"/g, ''))

            const barcode = row[barcodeIndex]
            const stock = parseInt(row[stockIndex])
            const cost = costIndex !== -1 ? parseFloat(row[costIndex]) : undefined

            if (barcode && !isNaN(stock)) {
                items.push({ barcode, newStock: stock, newCost: cost })
            }
        }
        return items
    }

    const handleAnalyze = async () => {
        if (!file) return

        setLoading(true)
        try {
            const items = await parseCSV(file)
            if (items.length === 0) {
                setLoading(false)
                return
            }

            const result = await previewInventoryUpdates(items)

            if (result.error) {
                toast.error(result.error)
            } else if (result.updates && result.updates.length > 0) {
                setPreview(result.updates)
                setStep('preview')
            } else {
                toast.info("No se encontraron diferencias en el stock ni en el costo")
            }
        } catch (error) {
            console.error(error)
            toast.error("Error al procesar el archivo")
        } finally {
            setLoading(false)
        }
    }

    const handleExecute = async () => {
        setLoading(true)
        try {
            const result = await executeInventoryUpdates(preview)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`Se actualizaron ${result.count} productos correctamente`)
                setStep('success')
                router.refresh()
            }
        } catch (error) {
            console.error(error)
            toast.error("Error al aplicar los cambios")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            {step === 'upload' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Cargar Archivo de Inventario</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                            <div className="text-sm text-blue-800 dark:text-blue-200">
                                <p className="font-bold mb-1">Instrucciones Importantes:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Solo debes modificar las columnas <strong>"Stock Actual"</strong> y <strong>"Costo Unitario (USD)"</strong>.</li>
                                    <li><strong>NO modifiques</strong> la columna "Código" ni el "Nombre", ya que se usan para identificar el producto.</li>
                                    <li>Si cambias el código, el sistema no encontrará el producto o dará error.</li>
                                </ul>
                            </div>
                        </div>

                        <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-4">
                            <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">Arrastra tu archivo CSV aquí o haz clic para seleccionar</p>
                                <p className="text-xs text-muted-foreground mt-1">Columnas requeridas: "Código", "Stock Actual". Opcional: "Costo Unitario (USD)"</p>
                            </div>
                            <Input
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="max-w-xs mx-auto"
                            />
                        </div>
                        <div className="flex justify-end">
                            <Button onClick={handleAnalyze} disabled={!file || loading}>
                                {loading ? "Analizando..." : "Analizar Archivo"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {step === 'preview' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Vista Previa de Cambios</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                            <div className="text-sm text-yellow-800 dark:text-yellow-200">
                                <p className="font-medium">Por favor revisa los cambios antes de confirmar.</p>
                                <p>Se actualizarán {preview.length} productos. Esta acción registrará los movimientos automáticamente.</p>
                            </div>
                        </div>

                        <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Producto</TableHead>
                                        <TableHead>Código</TableHead>
                                        <TableHead className="text-right">Stock Actual</TableHead>
                                        <TableHead className="text-center">Cambio</TableHead>
                                        <TableHead className="text-right">Nuevo Stock</TableHead>
                                        <TableHead className="text-right">Nuevo Costo (USD)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {preview.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.barcode}</TableCell>
                                            <TableCell className="text-right">{item.currentStock}</TableCell>
                                            <TableCell className="text-center">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${item.difference > 0
                                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                    : item.difference < 0
                                                        ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                                        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                                                    }`}>
                                                    {item.difference > 0 ? "+" : ""}{item.difference}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right font-bold">{item.newStock}</TableCell>
                                            <TableCell className="text-right">
                                                {item.newCost !== undefined && item.newCost !== item.currentCost ? (
                                                    <span className="text-blue-600 font-bold">
                                                        {formatCurrencyUSD(Number(item.newCost))}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        {formatCurrencyUSD(Number(item.currentCost))}
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex justify-between">
                            <Button variant="outline" onClick={() => setStep('upload')}>
                                Cancelar
                            </Button>
                            <Button onClick={handleExecute} disabled={loading}>
                                {loading ? "Aplicando..." : "Confirmar Actualización"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {step === 'success' && (
                <Card>
                    <CardContent className="py-12 text-center space-y-4">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                        </div>
                        <h2 className="text-2xl font-bold">¡Actualización Exitosa!</h2>
                        <p className="text-muted-foreground">
                            El inventario ha sido actualizado correctamente.
                        </p>
                        <Button onClick={() => {
                            setStep('upload')
                            setFile(null)
                            setPreview([])
                        }}>
                            Realizar otra actualización
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
