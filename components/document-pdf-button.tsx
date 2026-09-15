"use client"

// Ver la factura o un remito del pedido sin salir de la página, como en el portal
// del CRM: un modal con el PDF adentro.
//
// EL PDF SE PIDE CON FETCH ANTES DE MOSTRARLO y el iframe recibe un blob. Apuntando
// el iframe directo al endpoint, un 404 o un 502 (Alegra caído) se veía como JSON
// crudo adentro del visor: el iframe no expone el status. Así se muestra un mensaje.
//
// "Abrir en pestaña nueva" no es decorativo: el visor embebido de Safari en iPhone
// muestra solo la primera página. Imprimir sale del visor del navegador.

import { useEffect, useState } from "react"
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function DocumentPdfButton({
    url,
    title,
}: {
    /** La ruta que sirve el PDF inline; acepta ?download=1. */
    url: string
    /** "Factura A-0001-00000123": título del modal y del botón. */
    title: string
}) {
    const [open, setOpen] = useState(false)
    const [estado, setEstado] = useState<{ blobUrl: string } | { error: string } | null>(null)

    useEffect(() => {
        if (!open) return
        let cancelado = false
        let blobUrl: string | null = null
        setEstado(null)
        fetch(url, { cache: "no-store" })
            .then(async (res) => {
                if (!res.ok) {
                    const msg = await res.json().then((d) => d.error as string).catch(() => null)
                    if (!cancelado) setEstado({ error: msg ?? "No se pudo abrir el documento" })
                    return
                }
                blobUrl = URL.createObjectURL(await res.blob())
                if (!cancelado) setEstado({ blobUrl })
            })
            .catch(() => {
                if (!cancelado) setEstado({ error: "Error de conexión. Probá de nuevo." })
            })
        return () => {
            cancelado = true
            if (blobUrl) URL.revokeObjectURL(blobUrl)
        }
    }, [open, url])

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                title={`Ver ${title}`}
                aria-label={`Ver ${title}`}
                className="no-print inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
                <FileText className="h-3.5 w-3.5" />
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        <div className="h-[70vh] max-h-[780px] w-full overflow-hidden rounded-md border bg-muted/30">
                            {estado === null && (
                                <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando documento…
                                </div>
                            )}
                            {estado && "error" in estado && (
                                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                                    {estado.error}
                                </div>
                            )}
                            {estado && "blobUrl" in estado && (
                                <iframe src={estado.blobUrl} title={title} className="h-full w-full" />
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" asChild>
                                <a href={url} target="_blank" rel="noreferrer">
                                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir en pestaña nueva
                                </a>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                                <a href={`${url}?download=1`}>
                                    <Download className="mr-1.5 h-3.5 w-3.5" /> Descargar
                                </a>
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
