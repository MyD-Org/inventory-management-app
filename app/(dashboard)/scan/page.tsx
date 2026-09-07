import { MaterialLookup } from "@/components/material-lookup"
import { redirect } from "next/navigation"
import { auth } from "@/auth"

export default async function ScanPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  // Solo admin: el operador hace entradas y salidas desde el modal del inicio.
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="bg-background">
      <main className="container mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">Escáner de Códigos de Barras</h1>
            <p className="text-muted-foreground">
              Escanee o ingrese un código de barras para consultar información del material
            </p>
          </div>

          <MaterialLookup />
        </div>
      </main>
    </div>
  )
}
