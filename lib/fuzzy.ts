// Búsqueda difusa compartida por los buscadores de línea (materiales, mano de obra,
// productos). Tolera acentos y tipeos: "cañería" ≈ "caneria" ≈ "CAÑERIA", "sodadura"
// ≈ "soldadura". Usa fuse.js con ignoreDiacritics para que un acento nunca esconda un
// resultado (antes, buscar con acento no encontraba nada).

import Fuse, { type IFuseOptions } from "fuse.js"

// Normaliza texto para comparar: minúsculas, sin acentos ni diacríticos.
// Útil para comparaciones exactas fuera de fuse (p. ej. detectar "coincidencia exacta").
export function normalizeText(s: string): string {
    return s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim()
}

const BASE_OPTIONS: IFuseOptions<unknown> = {
    ignoreDiacritics: true, // "café" encuentra "cafe" y viceversa
    ignoreLocation: true, // el match puede estar en cualquier parte del texto
    threshold: 0.4, // tolera algún tipeo sin traer basura
    minMatchCharLength: 1,
}

// Filtra una lista ya cargada en el cliente por un texto, de forma difusa. Si el texto
// está vacío devuelve los primeros `limit` ítems (para mostrar sugerencias al enfocar).
export function fuzzyFilter<T>(
    items: T[],
    query: string,
    keys: string[],
    limit = 8,
): T[] {
    const q = query.trim()
    if (!q) return items.slice(0, limit)
    const fuse = new Fuse(items, { ...(BASE_OPTIONS as IFuseOptions<T>), keys })
    return fuse.search(q, { limit }).map((r) => r.item)
}
