// Tipos y validación del pedido. Vive SEPARADO de lib/orders.ts, igual que
// lib/order-statuses.ts: acá no se importa la base, así que la validación —que
// es el contrato con el bot del CRM— se puede testear sin levantar Postgres, y
// tampoco arrastra lib/database.ts a donde no corresponde.

import { ORDER_PRIORITIES } from "@/lib/order-statuses"

export type SpecKind = "list" | "text" | "boolean"

export interface SpecField {
    label: string
    options: string[]
    free_text: boolean
    // 'list' lista cerrada · 'text' texto libre · 'boolean' sí/no con un tilde.
    // En 'boolean' NO marcar es una respuesta válida (el "no"), no un dato que
    // falte confirmar: por eso no entra en el conteo de faltantes.
    kind: SpecKind
    // Cómo se muestra cada opción ("calido" -> "Cálido", "8" -> "8°"). Es solo
    // para la UI: GET /api/specs sigue devolviendo options tal cual manda el doc
    // del CRM, porque esos son los valores del contrato con el bot.
    labels: Record<string, string>
}

// Valida las specs de una línea contra el vocabulario. Los campos free_text
// (como 'other') aceptan cualquier cosa. Errores en texto legible: los lee una
// persona en la vista, o el bot en el 400 del POST.
export function validateSpecs(specs: Record<string, unknown>, vocab: Record<string, SpecField>): string[] {
    const errors: string[] = []
    for (const [key, value] of Object.entries(specs)) {
        const field = vocab[key]
        if (!field) {
            errors.push(`Campo de spec desconocido: "${key}". Válidos: ${Object.keys(vocab).join(", ")}`)
            continue
        }
        if (field.kind === "text") continue
        // Vacío = no especificado, no es un error.
        if (value === "" || value === null || value === undefined) continue
        if (field.kind === "boolean") {
            if (String(value) !== "con" && String(value) !== "sin") {
                errors.push(`Valor inválido para "${key}": "${value}". Válidos: con, sin`)
            }
            continue
        }
        if (!field.options.includes(String(value))) {
            errors.push(`Valor inválido para "${key}": "${value}". Válidos: ${field.options.join(", ")}`)
        }
    }
    return errors
}

export interface OrderItemPayload {
    product: string
    product_external_id?: string | null
    quantity: number
    specs?: Record<string, unknown>
}

export interface OrderPayload {
    external_id: string
    origin?: string
    customer: {
        external_id: string
        name?: string | null
        phone?: string | null
    }
    items: OrderItemPayload[]
    delivery_date_estimate?: string | null
    priority?: string
    notes?: string | null
    source_conversation?: string | null
}

// La validación completa. Recibe el vocabulario en vez de buscarlo: quién lo
// trae es lib/orders.ts, que sí habla con la base.
export function validateOrderPayloadWith(
    payload: OrderPayload,
    vocab: Record<string, SpecField>,
): string[] {
    const errors: string[] = []
    if (!payload.external_id?.trim()) errors.push("Falta external_id")
    if (!payload.customer?.external_id?.trim()) errors.push("Falta customer.external_id")
    if (!payload.items || payload.items.length === 0) errors.push("El pedido no tiene items")
    if (payload.priority && !ORDER_PRIORITIES.includes(payload.priority as any)) {
        errors.push(`priority inválida: "${payload.priority}". Válidas: ${ORDER_PRIORITIES.join(", ")}`)
    }
    // Si faltan campos base no tiene sentido enumerar además cada spec mala.
    if (errors.length > 0) return errors

    payload.items.forEach((item, idx) => {
        if (!String(item?.product ?? "").trim()) errors.push(`Item ${idx + 1}: falta product`)
        const qty = Number(item?.quantity ?? 1)
        if (!Number.isFinite(qty) || qty <= 0) errors.push(`Item ${idx + 1}: quantity inválida`)
        for (const e of validateSpecs(item?.specs ?? {}, vocab)) errors.push(`Item ${idx + 1}: ${e}`)
    })
    return errors
}
