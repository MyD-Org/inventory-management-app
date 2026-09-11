"use client"

// Duplicar una ficha de producto. Lo único que se pregunta es cuál es el
// producto nuevo; todo lo demás se copia y se edita después en la ficha, que es
// para lo que se duplica: dos productos que comparten casi toda la receta.
//
// EL NOMBRE SE BUSCA EN ALEGRA, con el mismo campo que la ficha
// (ProductNameAutocomplete): el producto que se está por costear casi siempre ya
// existe en el catálogo, y elegirlo de ahí deja la copia VINCULADA al ítem
// correcto (budgets.alegra_item_id). Escrito a mano, el vínculo queda en nada y
// al cotizar se crea un producto nuevo en Alegra —duplicado— sin que nadie lo
// pida. Igual que en la ficha, el texto libre se permite: un producto que
// todavía no está en Alegra se escribe y se crea al cotizar.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ProductNameAutocomplete } from "@/components/product-name-autocomplete"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Copy, Loader2 } from "lucide-react"
import { duplicateBudget } from "@/lib/budget-actions"
import { useToast } from "@/hooks/use-toast"

export function DuplicateBudgetButton({
    budgetId,
    budgetName,
    alegraEnabled = false,
}: {
    budgetId: number
    budgetName: string
    /** Igual que en la ficha: sin Alegra configurada el campo es texto libre. */
    alegraEnabled?: boolean
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [nombre, setNombre] = useState("")
    // El ítem de Alegra elegido en el buscador. null = producto que todavía no
    // está en Alegra; se crea al cotizar, como en la ficha.
    const [alegraItemId, setAlegraItemId] = useState<number | null>(null)
    const [duplicando, setDuplicando] = useState(false)

    function cambiarAbierto(abierto: boolean) {
        // Duplicar es una escritura en varios pasos: una vez mandada no se
        // cancela a medias, así que mientras tanto el diálogo no se cierra.
        if (!abierto && duplicando) return
        if (abierto) {
            // Vacío y no "X (copia)": el campo es un buscador de Alegra, y
            // precargarlo con el nombre del original lo llenaría de resultados
            // del producto que justamente NO es el que se está creando.
            setNombre("")
            setAlegraItemId(null)
        }
        setOpen(abierto)
    }

    async function duplicar() {
        if (!nombre.trim() || duplicando) return
        setDuplicando(true)
        const result = await duplicateBudget(budgetId, nombre, alegraItemId)
        setDuplicando(false)

        if ("error" in result && result.error) {
            // Si el nombre ya existe, el atajo útil es ir a la ficha que lo tiene.
            toast.error("Error", {
                description: result.error,
                action:
                    "existingId" in result && result.existingId
                        ? { label: "Abrir la que hay", onClick: () => router.push(`/fichas/${result.existingId}`) }
                        : undefined,
            })
            return
        }

        setOpen(false)
        toast.success("Ficha duplicada", {
            description: `Copiada de "${"copiadaDe" in result ? result.copiadaDe : budgetName}". Entra como borrador${
                alegraItemId == null ? " y como producto nuevo en Alegra." : " y vinculada al producto de Alegra."
            }`,
        })
        // Se abre la copia: quien duplica es para editarla, no para mirar la lista.
        if ("id" in result && result.id) router.push(`/fichas/${result.id}`)
    }

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                title="Duplicar"
                onClick={(e) => {
                    e.stopPropagation()
                    cambiarAbierto(true)
                }}
            >
                <Copy className="h-4 w-4" />
            </Button>

            {/* El diálogo vive dentro de una fila que navega al hacer click. Sin
                frenar la propagación acá, cualquier click adentro —el input, el
                botón— abre también la ficha de atrás. */}
            <div onClick={(e) => e.stopPropagation()}>
                <Dialog open={open} onOpenChange={cambiarAbierto}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Duplicar ficha</DialogTitle>
                            <DialogDescription>
                                Se copian los materiales con sus variantes, la mano de obra y los otros costos de
                                “{budgetName}”. Buscá el producto nuevo en Alegra; si todavía no está, escribilo y
                                se crea al cotizar. La copia entra como borrador.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-2">
                            <Label htmlFor="budget-name">Producto nuevo</Label>
                            <ProductNameAutocomplete
                                value={nombre}
                                itemId={alegraItemId}
                                onChange={setNombre}
                                onSelect={(it) => setAlegraItemId(it?.id ?? null)}
                                enabled={alegraEnabled}
                            />
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => cambiarAbierto(false)} disabled={duplicando}>
                                Cancelar
                            </Button>
                            <Button onClick={duplicar} disabled={!nombre.trim() || duplicando}>
                                {duplicando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Duplicar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    )
}
