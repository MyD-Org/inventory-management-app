// Formateo de montos en pesos argentinos, determinístico (sin depender del ICU del runtime):
// $ + separador de miles con '.', dos decimales separados por ','.
export function formatArs(n: number): string {
    const value = Number.isFinite(n) ? n : 0
    const sign = value < 0 ? "-" : ""
    const abs = Math.abs(value)
    const [intPart, decPart] = abs.toFixed(2).split(".")
    const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    return `${sign}$${intWithDots},${decPart}`
}

// Cantidades de stock. Las columnas son numeric(12,2) y el driver las devuelve
// como string ("12.00"), así que mostrarlas crudas llenaba la pantalla de
// decimales que no dicen nada: un prensacable no viene en 12,00 unidades. Los
// enteros van sin decimales y los fraccionados (1,75 m de cable) con los que
// tengan, hasta dos.
export function formatStock(value: number | string | null | undefined): string {
    const n = Number(value)
    if (!Number.isFinite(n)) return "0"

    const sign = n < 0 ? "-" : ""
    const abs = Math.abs(n)
    const [intPart, decPart] = abs.toFixed(2).split(".")
    const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")

    // "1.70" se muestra como "1,7"; "12.00" como "12".
    const dec = decPart.replace(/0+$/, "")
    return dec ? `${sign}${intWithDots},${dec}` : `${sign}${intWithDots}`
}
