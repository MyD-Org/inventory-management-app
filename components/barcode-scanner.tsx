"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Camera, Scan, Search } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// zxing pesa: se carga recién cuando alguien elige el modo Cámara.
const CameraBarcodeScanner = dynamic(
  () => import("@/components/camera-barcode-scanner").then(m => m.CameraBarcodeScanner),
  { ssr: false },
)

interface BarcodeScannerProps {
  isOpen: boolean
  onClose: () => void
  onScan: (barcode: string) => void
  title?: string
}

export function BarcodeScanner({ isOpen, onClose, onScan, title = "Escanear Código de Barras" }: BarcodeScannerProps) {
  const [manualInput, setManualInput] = useState("")
  const [lastScanned, setLastScanned] = useState<string>("")
  const [scanMode, setScanMode] = useState<"camera" | "manual" | "usb">("manual")
  const inputRef = useRef<HTMLInputElement>(null)

  // Limpiar recursos al cerrar
  useEffect(() => {
    if (!isOpen) {
      setManualInput("")
      setLastScanned("")
      setScanMode("manual")
    }
  }, [isOpen])

  // Escuchar eventos de teclado para lectores USB
  useEffect(() => {
    if (!isOpen || scanMode !== "usb") return

    let buffer = ""
    let timeout: NodeJS.Timeout

    const handleKeyPress = (e: KeyboardEvent) => {
      // Prevenir que interfiera con otros inputs
      if (e.target !== document.body) return

      if (e.key === "Enter") {
        if (buffer.length > 0) {
          handleScan(buffer)
          buffer = ""
        }
      } else if (e.key.length === 1) {
        buffer += e.key

        // Limpiar buffer después de 100ms de inactividad
        clearTimeout(timeout)
        timeout = setTimeout(() => {
          buffer = ""
        }, 100)
      }
    }

    document.addEventListener("keypress", handleKeyPress)
    return () => {
      document.removeEventListener("keypress", handleKeyPress)
      clearTimeout(timeout)
    }
  }, [isOpen, scanMode])

  const handleScan = (barcode: string) => {
    if (barcode && barcode !== lastScanned) {
      setLastScanned(barcode)
      onScan(barcode)

      // Feedback visual/sonoro
      if ("vibrate" in navigator) {
        navigator.vibrate(100)
      }

      // Auto-cerrar después de escanear
      setTimeout(() => {
        onClose()
      }, 1000)
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualInput.trim()) {
      handleScan(manualInput.trim())
      setManualInput("")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scan className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selector de modo */}
          <div className="flex gap-2">
            <Button
              variant={scanMode === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setScanMode("manual")}
            >
              Manual
            </Button>
            <Button
              variant={scanMode === "camera" ? "default" : "outline"}
              size="sm"
              onClick={() => setScanMode("camera")}
            >
              <Camera className="w-4 h-4 mr-1" />
              Cámara
            </Button>
            <Button
              variant={scanMode === "usb" ? "default" : "outline"}
              size="sm"
              onClick={() => setScanMode("usb")}
            >
              <Scan className="w-4 h-4 mr-1" />
              Lector USB
            </Button>
          </div>

          {/* Modo Manual */}
          {scanMode === "manual" && (
            <Card>
              <CardContent className="pt-4">
                <form onSubmit={handleManualSubmit} className="space-y-3">
                  <div>
                    <Input
                      ref={inputRef}
                      type="text"
                      placeholder="Ingrese el código de barras"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      className="font-mono"
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={!manualInput.trim()}>
                    <Search className="w-4 h-4 mr-2" />
                    Buscar Producto
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Modo Cámara. Antes esto mostraba el video y un botón "Capturar" que
              devolvía un código fijo inventado, sin leer nada de la imagen.
              Ahora usa el mismo lector que el modal de entrada/salida. */}
          {scanMode === "camera" && (
            <CameraBarcodeScanner
              onDetect={handleScan}
              onClose={() => setScanMode("manual")}
            />
          )}

          {/* Modo USB */}
          {scanMode === "usb" && (
            <Card>
              <CardContent className="pt-4">
                <div className="text-center space-y-3">
                  <div className="w-full h-32 bg-muted rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Scan className="w-8 h-8 text-primary mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Lector conectado</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="animate-pulse">
                    Esperando escaneo...
                  </Badge>
                  <p className="text-xs text-muted-foreground">Use su lector de códigos de barras USB para escanear</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Último código escaneado */}
          {lastScanned && (
            <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  >
                    Escaneado
                  </Badge>
                  <span className="font-mono text-sm">{lastScanned}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
