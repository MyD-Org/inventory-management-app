import { NextResponse, type NextRequest } from "next/server"
import { sql } from "@/lib/database"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { insertMaterialFamily, type MaterialFamilyPayload } from "@/lib/material-families"
import { mergeFamilyOptions, type CostStrategy, type StoredOption } from "@/lib/material-family"

// Tool de IA: agrega variantes a una familia que YA existe.
//
// Es aditiva por diseño y el merge se hace acá, no en el agente. Guardar una familia
// reemplaza todas sus variantes (insertMaterialFamily hace delete + insert), así que
// una tool de "editar" a la que el modelo le mandara la lista entera podría borrar la
// carga previa por omisión. Recibiendo solo lo nuevo, lo peor que puede pasar es que
// no agregue nada. Para reemplazar o quitar variantes está el editor, que es donde se
// ve qué se está pisando.
//
// Crear familias nuevas es create-material-family. Acá una familia inexistente es un
// error, no un alta implícita.
export async function POST(request: NextRequest) {
    const denied = requireInternalSecret(request)
    if (denied) return denied

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }
    if (typeof body !== "object" || body === null) {
        return NextResponse.json({ error: "Body debe ser un objeto" }, { status: 400 })
    }

    const b = body as Record<string, unknown>
    const familyName = typeof b.family_name === "string" ? b.family_name.trim() : ""
    if (!familyName) {
        return NextResponse.json({ error: "Falta family_name" }, { status: 400 })
    }

    // Misma convención que create-material-family: el renderer de templates de ai-api
    // solo interpola escalares, así que las listas viajan como string JSON.
    let rawOptions: unknown = b.options
    if (rawOptions === undefined && typeof b.options_json === "string") {
        try {
            rawOptions = JSON.parse(b.options_json)
        } catch {
            return NextResponse.json({ error: "options_json no es JSON válido" }, { status: 400 })
        }
    }
    if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
        return NextResponse.json({ error: "Faltan options" }, { status: 400 })
    }

    const incoming: Array<{ specValue: string; materialId: number }> = []
    for (const item of rawOptions) {
        if (typeof item !== "object" || item === null) {
            return NextResponse.json({ error: "Cada option debe ser un objeto" }, { status: 400 })
        }
        const o = item as Record<string, unknown>
        const specValue = typeof o.spec_value === "string" ? o.spec_value.trim() : ""
        const materialId = Number(o.material_id)
        if (!specValue) {
            return NextResponse.json({ error: "Falta spec_value en una option" }, { status: 400 })
        }
        if (!Number.isFinite(materialId)) {
            return NextResponse.json(
                { error: `Material inválido para la variante "${specValue}"` },
                { status: 400 },
            )
        }
        incoming.push({ specValue, materialId })
    }

    // La familia se busca por nombre porque es lo único que el agente conoce: no hay
    // tool que liste familias con su id.
    const [family] = await sql`
        SELECT id, name, spec_field_key, default_spec_value, cost_strategy, cost_material_id
        FROM material_families
        WHERE LOWER(TRIM(name)) = LOWER(${familyName})
    `
    if (!family) {
        return NextResponse.json(
            { error: `No existe una familia llamada "${familyName}". Para crearla usá create_material_family.` },
            { status: 404 },
        )
    }

    const existingRows = await sql`
        SELECT spec_value, material_id, is_default
        FROM material_family_options
        WHERE family_id = ${family.id}
    `
    const existing: StoredOption[] = existingRows.map((r) => ({
        specValue: String(r.spec_value),
        materialId: Number(r.material_id),
        isDefault: Boolean(r.is_default),
    }))

    const { options, added, skipped } = mergeFamilyOptions(existing, incoming)
    if (added.length === 0) {
        // Nada que hacer: se responde 200 para que el agente lo cuente como resultado,
        // no como falla que valga la pena reintentar.
        return NextResponse.json({
            success: true,
            family_id: family.id as number,
            added: 0,
            skipped: skipped.length,
            message: "Esas variantes ya estaban cargadas en la familia.",
        })
    }

    const payload: MaterialFamilyPayload = {
        name: String(family.name),
        spec_field_key: String(family.spec_field_key),
        default_spec_value: (family.default_spec_value as string | null) ?? null,
        cost_strategy: family.cost_strategy as CostStrategy,
        cost_material_id: (family.cost_material_id as number | null) ?? null,
        options: options.map((o) => ({
            spec_value: o.specValue,
            material_id: o.materialId,
            is_default: o.isDefault,
        })),
    }

    const result = await insertMaterialFamily(family.id as number, payload)
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
        success: true,
        family_id: result.id,
        added: added.length,
        skipped: skipped.length,
        total_options: options.length,
    })
}
