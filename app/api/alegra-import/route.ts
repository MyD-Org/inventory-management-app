import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { importAlegraFiles, type AlegraFile } from "@/lib/alegra-import"

// Importa exports CSV de Alegra (facturas / transacciones) al espejo local.
// Solo admin. Recibe multipart/form-data con uno o más archivos "files".
export async function POST(request: NextRequest) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    if (session.user.role !== "admin") return NextResponse.json({ error: "Solo administradores" }, { status: 403 })

    try {
        const form = await request.formData()
        const uploaded = form.getAll("files").filter((f): f is File => f instanceof File)
        if (uploaded.length === 0) {
            return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 })
        }

        const csvs = uploaded.filter((f) => f.name.toLowerCase().endsWith(".csv"))
        if (csvs.length === 0) {
            return NextResponse.json(
                { error: "Subí los archivos .csv (descomprimí primero el .zip de Alegra)" },
                { status: 400 },
            )
        }

        const files: AlegraFile[] = await Promise.all(
            csvs.map(async (f) => ({ name: f.name, buffer: await f.arrayBuffer() })),
        )
        const summary = await importAlegraFiles(files)
        return NextResponse.json(summary)
    } catch (error) {
        console.error("Error en alegra-import:", error)
        const message = error instanceof Error ? error.message : "Error interno"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
