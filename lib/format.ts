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
