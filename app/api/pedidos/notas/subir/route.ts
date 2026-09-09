// Firma la subida de una foto al Blob store. El archivo NO pasa por acá: el
// navegador lo manda directo al Blob con un token corto que esta ruta emite.
//
// Se hace así y no con un POST del archivo a la app por el teléfono: una foto de
// celular son varios MB por un 4G del taller, y atravesar la función serverless
// para después reenviarla al Blob duplica la subida y el tiempo de espera.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { auth } from "@/auth"

// Lo que el Blob acepta para una nota. La lista es corta a propósito: son fotos
// sacadas con el teléfono, no un adjuntador de archivos genérico.
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]

// 8 MB por foto. El cliente ya las reduce antes de subir (ver components/note-photo-input),
// así que llegar a este techo significa que algo no se redujo — y ahí es mejor
// que el Blob lo rechace que subir 20 MB sin querer.
const MAX = 8 * 1024 * 1024

export async function POST(request: Request): Promise<NextResponse> {
    const body = (await request.json()) as HandleUploadBody

    try {
        const result = await handleUpload({
            body,
            request,
            // Se corre ANTES de emitir el token: sin sesión no hay subida. Es la
            // única puerta, porque después el navegador habla directo con el Blob.
            onBeforeGenerateToken: async () => {
                const session = await auth()
                if (!session?.user) throw new Error("No autenticado")
                return {
                    allowedContentTypes: TIPOS,
                    maximumSizeInBytes: MAX,
                    // El nombre que manda el cliente se ignora: el Blob le agrega
                    // un sufijo al azar, así que dos fotos "IMG_0001.jpg" no se
                    // pisan y la URL no se puede adivinar.
                    addRandomSuffix: true,
                }
            },
            // NO se define onUploadCompleted. El Blob puede avisar por webhook
            // cuando el archivo terminó de subir, pero no hace falta: la foto se
            // ata a la nota en addOrderNote, con la URL que el cliente recibe de
            // vuelta. Definirlo vacío pedía un webhook al aire en producción y
            // en local imprimía un warning en cada subida, porque el Blob no
            // puede llamar de vuelta a localhost.
            //
            // (La subida arranca cuando se aprieta "Dejar nota", no al elegir la
            // foto: si arrancara al elegirla, cada arrepentimiento dejaría un
            // archivo huérfano en el store que nadie borra nunca.)
        })

        return NextResponse.json(result)
    } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo subir la foto"
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
