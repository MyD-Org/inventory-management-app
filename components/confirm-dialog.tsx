"use client"

// Diálogo de confirmación reutilizable (reemplaza al confirm() nativo del navegador).
// Controlado: manejás open/onOpenChange desde el componente padre.

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

export function ConfirmDialog({
    open,
    onOpenChange,
    title = "¿Confirmás la acción?",
    description,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    destructive = false,
    loading = false,
    onConfirm,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title?: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    destructive?: boolean
    loading?: boolean
    onConfirm: () => void
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={destructive ? "destructive" : "default"}
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
