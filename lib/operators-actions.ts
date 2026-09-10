"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import type { Operator } from "@/lib/operators-types"

// Altas, bajas y renombres de operarios. Archivo aparte de lib/operators.ts
// porque es "use server": lo importa un client component y cada export queda
// expuesto como endpoint, así que todos chequean sesión de admin adentro.

function limpiarNombre(value: unknown): string {
    // Espacios de más adentro incluidos: "Juan  Pérez" y "Juan Pérez" son la
    // misma persona y el índice único no los distingue.
    return String(value ?? "").trim().replace(/\s+/g, " ")
}

export async function createOperator(name: string) {
    const session = await auth()
    if (session?.user?.role !== "admin") return { error: "No tenés permisos para esta acción" }

    const limpio = limpiarNombre(name)
    if (!limpio) return { error: "El nombre es obligatorio" }
    if (limpio.length > 100) return { error: "El nombre es demasiado largo" }

    try {
        const [creado] = (await sql`
            INSERT INTO operators (name) VALUES (${limpio}) RETURNING id, name, active
        `) as any[]
        revalidatePath("/settings/operarios")
        return { ok: true as const, operator: creado as Operator }
    } catch (error: any) {
        // 23505 = el índice único sobre lower(name). Es el caso esperable —
        // cargar dos veces al mismo — y merece un mensaje, no un error genérico.
        if (error?.code === "23505") return { error: "Ya hay un operario con ese nombre" }
        console.error("Error creando el operario:", error)
        return { error: "No se pudo crear el operario" }
    }
}

export async function renameOperator(id: number, name: string) {
    const session = await auth()
    if (session?.user?.role !== "admin") return { error: "No tenés permisos para esta acción" }

    const limpio = limpiarNombre(name)
    if (!limpio) return { error: "El nombre es obligatorio" }
    if (limpio.length > 100) return { error: "El nombre es demasiado largo" }

    try {
        // El histórico NO se reescribe: stock_movements.operator_name guardó el
        // nombre que tenía al momento de cada movimiento. Corregir un typo acá
        // arregla la lista de ahora en adelante, no el pasado.
        await sql`UPDATE operators SET name = ${limpio} WHERE id = ${id}`
        revalidatePath("/settings/operarios")
        return { ok: true as const }
    } catch (error: any) {
        if (error?.code === "23505") return { error: "Ya hay un operario con ese nombre" }
        console.error("Error renombrando el operario:", error)
        return { error: "No se pudo renombrar el operario" }
    }
}

/** Alta y baja de la lista del modal. No hay borrado: un operario borrado
 *  dejaría movimientos apuntando a la nada. */
export async function setOperatorActive(id: number, active: boolean) {
    const session = await auth()
    if (session?.user?.role !== "admin") return { error: "No tenés permisos para esta acción" }

    try {
        await sql`UPDATE operators SET active = ${active} WHERE id = ${id}`
        revalidatePath("/settings/operarios")
        return { ok: true as const }
    } catch (error) {
        console.error("Error cambiando el estado del operario:", error)
        return { error: "No se pudo cambiar el estado del operario" }
    }
}
