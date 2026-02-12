const usdFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrencyUSD(value: number) {
  return usdFormatter.format(Number.isFinite(value) ? value : 0)
}
