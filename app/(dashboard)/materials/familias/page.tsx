import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { MaterialFamiliesManager } from "@/components/material-families-manager"
import { listMaterialFamilies } from "@/lib/material-families"
import { listSpecChoices } from "@/lib/spec-choices"

export const dynamic = 'force-dynamic';

export default async function MaterialFamiliesPage() {
    const session = await auth()

    // Mismo criterio que categorías, proveedores y mano de obra: el catálogo lo
    // administran los admins. Las hojas de costo lo consumen, no lo editan.
    if (session?.user?.role !== 'admin') {
        redirect('/')
    }

    const [families, specFields] = await Promise.all([listMaterialFamilies(), listSpecChoices()])

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="mx-auto max-w-4xl">
                    <h1 className="mb-1 text-2xl font-bold">Familias de Materiales</h1>
                    <p className="mb-6 text-sm text-muted-foreground">
                        Una materia prima que viene en variantes: “Tira LED” según el color, “Grampa” según el largo,
                        “Óptica” según el grado. Se carga una sola vez acá y después se elige como una línea más en
                        cualquier cálculo de costo, con todas sus variantes ya asociadas. Si mañana cambia el material
                        de una variante, se cambia acá y vale para todos los productos.
                    </p>
                    <MaterialFamiliesManager families={families} specFields={specFields} />
                </div>
            </main>
        </div>
    )
}
