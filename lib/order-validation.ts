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
    // El nombre de cada opción, por clave. `options` son las claves: no cambian
    // nunca y es lo que se guarda en los pedidos, familias y fichas. El nombre se
    // edita desde /settings/variaciones y es lo único que se muestra. Incluye las
    // opciones desactivadas, para que un pedido viejo siga leyéndose.
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

// Traduce los NOMBRES de opción a su clave. El bot ve los nombres actuales en
// GET /api/specs y los devuelve tal cual; la línea tiene que guardar la clave,
// que es lo que enganchan las familias y las fichas. Si llega la clave, queda
// igual: los que ya mandaban claves siguen funcionando después de un renombre.
// Lo que no coincide con nada tampoco se toca, así validateSpecs lo reporta.
export function normalizeSpecs(
    specs: Record<string, unknown> | null | undefined,
    vocab: Record<string, SpecField>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(specs ?? {})) {
        const field = vocab[key]
        if (!field || field.kind !== "list" || typeof value !== "string" || field.options.includes(value)) {
            out[key] = value
            continue
        }
        const buscado = value.trim().toLowerCase()
        const clave =
            field.options.find((o) => o.toLowerCase() === buscado) ??
            field.options.find((o) => (field.labels[o] ?? o).trim().toLowerCase() === buscado)
        out[key] = clave ?? value
    }
    return out
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
    /** Código con el que identifica al pedido el sistema del cliente. Texto libre. */
    reference?: string | null
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

// Los teléfonos vienen de tres lados con tres formatos: WhatsApp manda el wa_id
// sin '+' ("5492235903012"), Alegra tiene cargado de todo ("+5492235903012",
// "223 4959686", "011 4574-3077") y a mano se escribe cualquier cosa. Comparar
// los últimos 10 dígitos empareja los tres sin tener que saber si el número trae
// código de país o el 15: en Argentina esos 10 dígitos son área + abonado, que
// es lo que identifica la línea.
//
// Devuelve "" si no hay al menos 8 dígitos: un número tan corto no alcanza para
// identificar a nadie y matchearía de más, así que se trata como ausente.
export function normalizePhone(raw: string | null | undefined): string {
    const digits = String(raw ?? "").replace(/\D/g, "")
    if (digits.length < 8) return ""
    return digits.slice(-10)
}
