import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AlegraImportClient } from "@/components/alegra-import-client"

export const dynamic = "force-dynamic"

export default async function ImportarAlegraPage() {
    const session = await auth()
    if (session?.user?.role !== "admin") redirect("/settings")

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto px-4 py-6 max-w-2xl">
                <h1 className="text-2xl font-bold mb-1">Importar datos de Alegra</h1>
                <p className="text-sm text-muted-foreground mb-6">
                    Trae tus ventas y pagos de Alegra a este sistema. Reimportar no duplica: actualiza lo que ya existe.
                </p>
                <AlegraImportClient />
            </main>
        </div>
    )
}
