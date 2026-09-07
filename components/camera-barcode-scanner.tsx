"use client"

import { useEffect, useRef, useState } from "react"
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser"
import { BarcodeFormat, DecodeHintType } from "@zxing/library"
import { CameraOff, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"

// Formatos 1D nomás: son los que salen de una etiquetadora y los que usan los
// códigos del inventario. Restringirlos hace la lectura bastante más rápida que
// dejar a zxing probando también QR y compañía en cada cuadro.
const FORMATOS = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.ITF,
]

/**
 * Lector de códigos de barras por cámara. Pensado para el celular: pide la
 * cámara trasera y va leyendo cuadro a cuadro hasta que engancha un código.
 *
 * Ojo: getUserMedia solo existe sobre HTTPS (o localhost). En producción va,
 * pero probándolo en local por IP de red la cámara no arranca.
 */
export function CameraBarcodeScanner({
    onDetect,
    onClose,
}: {
    onDetect: (code: string) => void
    onClose: () => void
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [estado, setEstado] = useState<"iniciando" | "leyendo" | "error">("iniciando")
    const [mensajeError, setMensajeError] = useState("")

    useEffect(() => {
        let controles: IScannerControls | null = null
        let cancelado = false
        // Un código leído dispara varios callbacks seguidos (zxing sigue
        // decodificando hasta que paramos): sin esto onDetect corre de a 3.
        let yaLeido = false

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS)
        const lector = new BrowserMultiFormatReader(hints)

        lector
            .decodeFromConstraints(
                { video: { facingMode: "environment" } },
                videoRef.current!,
                (result) => {
                    if (!result || yaLeido) return
                    yaLeido = true
                    if ("vibrate" in navigator) navigator.vibrate(80)
                    onDetect(result.getText())
                },
            )
            .then((c) => {
                if (cancelado) {
                    c.stop()
                    return
                }
                controles = c
                setEstado("leyendo")
            })
            .catch((error: unknown) => {
                if (cancelado) return
                console.error("Error al abrir la cámara:", error)
                const nombre = (error as { name?: string })?.name
                setMensajeError(
                    nombre === "NotAllowedError"
                        ? "No diste permiso para usar la cámara. Habilitalo en el navegador y volvé a intentar."
                        : nombre === "NotFoundError"
                          ? "No se encontró ninguna cámara en este dispositivo."
                          : "No se pudo abrir la cámara. Probá con el lector o escribí el código a mano.",
                )
                setEstado("error")
            })

        return () => {
            cancelado = true
            controles?.stop()
        }
        // onDetect se recrea en cada render del padre; incluirlo reiniciaría la
        // cámara todo el tiempo. El montaje/desmontaje es lo que manda acá.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (estado === "error") {
        return (
            <div className="space-y-3 rounded-lg border border-dashed p-4 text-center">
                <CameraOff className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{mensajeError}</p>
                <Button type="button" variant="outline" size="sm" onClick={onClose}>
                    Cerrar
                </Button>
            </div>
        )
    }

    return (
        <div className="relative overflow-hidden rounded-lg bg-black">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-56 w-full object-cover"
            />

            {/* Mira: el código tiene que entrar en la franja del medio. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-16 w-4/5 rounded border-2 border-white/80" />
            </div>

            {estado === "iniciando" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
            )}

            <p className="absolute inset-x-0 bottom-0 bg-black/60 py-1.5 text-center text-xs text-white">
                Apuntá al código de barras
            </p>

            <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-2 top-2 h-8 w-8"
                onClick={onClose}
                title="Cerrar la cámara"
                aria-label="Cerrar la cámara"
            >
                <X className="h-4 w-4" />
            </Button>
        </div>
    )
}
