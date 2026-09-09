// Las fotos de las notas, del lado del navegador: reducirlas y subirlas al Blob.
//
// Se reducen ANTES de subir y no en el servidor. Una foto de celular son 3-5 MB
// y en el 4G del taller eso es medio minuto de espera por foto; a 1600px de lado
// largo pesa unos 300 KB, se sube en un segundo y en pantalla se ve igual — la
// nota se lee en un teléfono, nadie va a hacer zoom a nivel de píxel.

"use client"

import { upload } from "@vercel/blob/client"

/** Lado largo al que se reduce. Suficiente para leer una etiqueta o un número de serie. */
const LADO_MAX = 1600
const CALIDAD = 0.82

export interface FotoSubida {
    url: string
    pathname: string
    width: number | null
    height: number | null
}

/**
 * La foto reducida, o la original si el navegador no la pudo decodificar.
 *
 * El caso real de "no la pudo decodificar" es HEIC: el iPhone guarda así las
 * fotos de la galería y solo Safari las abre. En Chrome de Android el canvas
 * queda en blanco, así que ahí se sube el archivo tal cual y el server lo acepta
 * igual (el tipo está en la lista de la ruta de subida).
 */
async function reducir(file: File): Promise<{ data: Blob; nombre: string; width: number | null; height: number | null }> {
    const original = { data: file, nombre: file.name, width: null, height: null }
    if (!file.type.startsWith("image/")) return original

    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(file)
    } catch {
        return original
    }

    try {
        const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
        const w = Math.round(bitmap.width * escala)
        const h = Math.round(bitmap.height * escala)

        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) return original
        ctx.drawImage(bitmap, 0, 0, w, h)

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", CALIDAD),
        )
        if (!blob) return original

        // Si reducir no ganó nada (una foto ya chica, un PNG de pantalla), se
        // sube la original: no tiene sentido recomprimirla a JPEG y perder
        // nitidez para quedar igual de pesada.
        if (blob.size >= file.size) return { ...original, width: bitmap.width, height: bitmap.height }

        // La extensión tiene que coincidir con lo que salió del canvas, que es
        // JPEG siempre — subir un .png que por dentro es JPEG confunde después.
        const base = file.name.replace(/\.[^.]+$/, "") || "foto"
        return { data: blob, nombre: `${base}.jpg`, width: w, height: h }
    } finally {
        bitmap.close()
    }
}

/**
 * Sube las fotos al Blob y devuelve lo que hay que guardar en la nota.
 *
 * Van de una en una y no en paralelo: son varias y desde un teléfono, y cuatro
 * subidas peleando por el mismo 4G tardan más que las mismas cuatro en fila.
 * `onProgress` es para poder decir "Subiendo 2 de 4" en vez de un spinner mudo.
 */
export async function subirFotos(
    files: File[],
    onProgress?: (hechas: number, total: number) => void,
): Promise<FotoSubida[]> {
    const subidas: FotoSubida[] = []
    for (const [i, file] of files.entries()) {
        const { data, nombre, width, height } = await reducir(file)
        const blob = await upload(nombre, data, {
            access: "public",
            handleUploadUrl: "/api/pedidos/notas/subir",
            contentType: data.type || file.type || "image/jpeg",
        })
        subidas.push({ url: blob.url, pathname: blob.pathname, width, height })
        onProgress?.(i + 1, files.length)
    }
    return subidas
}
