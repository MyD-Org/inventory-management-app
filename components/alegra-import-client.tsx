"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

interface FileResult {
    name: string
    kind: "invoices" | "credit_notes" | "payments" | "receivables" | "skipped"
    docs?: number
    created?: number
    updated?: number
    items?: number
    skipped?: number
    outstanding?: number
}
interface ImportSummary {
    files: FileResult[]
    totals: { documents: number; payments: number; clients: number }
}

export function AlegraImportClient() {
    const [files, setFiles] = useState<File[]>([])
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<ImportSummary | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function handleImport() {
        if (files.length === 0) return
        setLoading(true); setError(null); setResult(null)
        try {
            const form = new FormData()
            for (const f of files) form.append("files", f)
            const res = await fetch("/api/alegra-import", { method: "POST", body: form })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Error al importar")
            setResult(data as ImportSummary)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error al importar")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">1. Exportá desde Alegra</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p>En Alegra web: <strong>Reportes → Para trabajar → Exportar facturas</strong> (y también <strong>Informe contador</strong> para traer los pagos).</p>
                    <p>Se baja un <strong>.zip</strong>: descomprimilo (doble clic) y subí los archivos <strong>.csv</strong> que quedan adentro.</p>
                    <p>Para que el <strong>saldo por cobrar</strong> coincida exacto con Alegra, subí además el reporte <strong>Cuentas por cobrar</strong> (se baja en <strong>.xlsx</strong>). Sin él, el saldo se estima a partir de los pagos.</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">2. Subí los archivos (CSV y XLSX)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition-colors">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                            {files.length > 0 ? `${files.length} archivo(s) seleccionado(s)` : "Clic para elegir archivos .csv y .xlsx"}
                        </span>
                        <input
                            type="file" accept=".csv,.xlsx" multiple className="hidden"
                            onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setResult(null); setError(null) }}
                        />
                    </label>

                    {files.length > 0 && (
                        <ul className="text-sm space-y-1">
                            {files.map((f) => (
                                <li key={f.name} className="flex items-center gap-2 text-muted-foreground">
                                    <FileText className="h-4 w-4 shrink-0" /> {f.name}
                                </li>
                            ))}
                        </ul>
                    )}

                    <Button onClick={handleImport} disabled={files.length === 0 || loading} className="w-full">
                        {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando…</>) : "Importar a mi sistema"}
                    </Button>
                    {loading && (
                        <p className="text-xs text-muted-foreground text-center">
                            Puede tardar según la cantidad de facturas. No cierres la página.
                        </p>
                    )}
                </CardContent>
            </Card>

            {error && (
                <Card className="border-destructive">
                    <CardContent className="flex items-start gap-2 pt-6 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
                    </CardContent>
                </Card>
            )}

            {result && (
                <Card className="border-green-600/50">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2 text-green-700">
                            <CheckCircle2 className="h-5 w-5" /> Importación completa
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ul className="text-sm space-y-1">
                            {result.files.map((f, i) => (
                                <li key={i} className="text-muted-foreground">
                                    {f.kind === "invoices" && `📄 ${f.name}: ${f.docs} facturas (${f.created} nuevas, ${f.updated} actualizadas), ${f.items} líneas`}
                                    {f.kind === "credit_notes" && `📄 ${f.name}: ${f.docs} notas de crédito (${f.created} nuevas, ${f.updated} actualizadas), ${f.items} líneas`}
                                    {f.kind === "payments" && `💰 ${f.name}: ${f.created} pagos nuevos, ${f.updated} actualizados, ${f.skipped} omitidos`}
                                    {f.kind === "receivables" && `🧾 ${f.name}: ${f.docs} facturas por cobrar, saldo ${(f.outstanding ?? 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}`}
                                    {f.kind === "skipped" && `⏭️ ${f.name}: formato no reconocido, salteado`}
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-4 text-sm border-t pt-3">
                            <span><strong>{result.totals.documents}</strong> documentos</span>
                            <span><strong>{result.totals.payments}</strong> pagos</span>
                            <span><strong>{result.totals.clients}</strong> clientes</span>
                            <span className="text-muted-foreground">totales en tu base</span>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
