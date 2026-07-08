// Cálculos de totales de un presupuesto, con descuento e impuesto POR LÍNEA.
// Se usa desde el editor (cliente), el PDF de impresión (server) y donde haga falta,
// para que los números coincidan siempre.

export interface QuoteCalcLine {
    qty: number
    unitPrice: number
    discountPct: number // % de descuento de la línea (0-100)
    taxPct: number      // % de impuesto de la línea (>= 0)
}

// Importe de la línea antes de impuesto, ya con su descuento aplicado.
export function lineNet(l: QuoteCalcLine): number {
    return l.qty * l.unitPrice * (1 - l.discountPct / 100)
}

// Impuesto de la línea.
export function lineTax(l: QuoteCalcLine): number {
    return lineNet(l) * (l.taxPct / 100)
}

export interface QuoteTotals {
    gross: number    // suma de qty * precio (sin descuento)
    discount: number // suma de descuentos por línea
    subtotal: number // gross - discount (neto sin impuesto)
    tax: number      // suma de impuestos por línea
    total: number    // subtotal + tax
}

export function quoteTotals(lines: QuoteCalcLine[]): QuoteTotals {
    let gross = 0
    let discount = 0
    let tax = 0
    for (const l of lines) {
        const g = l.qty * l.unitPrice
        gross += g
        discount += g * (l.discountPct / 100)
        tax += lineTax(l)
    }
    const subtotal = gross - discount
    return { gross, discount, subtotal, tax, total: subtotal + tax }
}
