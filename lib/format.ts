// Formateo de montos en pesos argentinos, determinístico (sin depender del ICU del runtime):
// $ + separador de miles con '.', sin decimales.
export function formatArs(n: number): string {
    const rounded = Math.round(Number.isFinite(n) ? n : 0)
    const sign = rounded < 0 ? "-" : ""
    return `${sign}$${Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}
