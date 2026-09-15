import { NextResponse } from "next/server"
import { AlegraError } from "@/lib/alegra"

// Sirve el PDF de Alegra desde nuestro server, como hace el portal del CRM.
//
// SE PROXEA, NO SE REDIRIGE: la URL que da Alegra está firmada y quien la tenga
// entra sin loguearse. Redirigiendo quedaba en el historial y se podía compartir
// hasta que venza. Además, servido inline desde nuestro dominio el visor del modal
// lo puede mostrar en un iframe.
export async function proxyAlegraPdf(
    getUrl: () => Promise<string | null>,
    filename: string,
    download: boolean,
): Promise<Response> {
    try {
        const url = await getUrl()
        if (!url) {
            return NextResponse.json({ error: "Alegra todavía no tiene el PDF de este documento" }, { status: 409 })
        }
        const pdf = await fetch(url, { cache: "no-store" })
        if (!pdf.ok || !pdf.body) {
            console.error(`[pdf] el CDN de Alegra devolvió ${pdf.status} para ${filename}`)
            return NextResponse.json({ error: "No se pudo traer el PDF de Alegra" }, { status: 502 })
        }
        const safe = filename.replace(/[^\w.-]+/g, "-")
        return new Response(pdf.body, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safe}.pdf"`,
                "Cache-Control": "private, no-store",
            },
        })
    } catch (error) {
        const status = error instanceof AlegraError ? error.status : 500
        console.error("[pdf]", error)
        return NextResponse.json(
            { error: "No se pudo traer el PDF de Alegra" },
            { status: status >= 500 ? 502 : status },
        )
    }
}
