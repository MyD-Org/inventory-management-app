"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StockMovementDialog } from "./stock-movement-dialog"

interface Material {
  id: number
  name: string
  barcode: string
  current_stock?: number
  unit_of_measure?: string
}

export function MovementPageHeaderAction({
  type,
  materials,
}: {
  type: "entrada" | "salida"
  materials: Material[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        {type === "entrada" ? "Entrada" : "Salida"}
      </Button>
      <StockMovementDialog type={type} materials={materials} open={open} onOpenChange={setOpen} />
    </>
  )
}
