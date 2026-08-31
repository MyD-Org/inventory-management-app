import { NextResponse, type NextRequest } from "next/server"
import { requireInternalSecret } from "@/lib/ai-tools-auth"
import { insertMaterialFamily, type MaterialFamilyPayload } from "@/lib/material-families"
import type { CostStrategy } from "@/lib/material-family"

// Tool de IA: crea una familia de materiales con sus variantes.
// El agente debe haber buscado previamente los materiales con search-materials para
// obtener sus ids reales. No se actualizan familias existentes: si ya hay una con ese
// nombre, devuelve error para evitar pisar datos.
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
    const name = typeof b.name === "string" ? b.name.trim() : ""
    const specFieldKey = typeof b.spec_field_key === "string" ? b.spec_field_key.trim() : ""
    const defaultSpecValue = typeof b.default_spec_value === "string" ? b.default_spec_value.trim() : null
    const costStrategy = (typeof b.cost_strategy === "string" ? b.cost_strategy : "default") as CostStrategy
    const costMaterialId = Number(b.cost_material_id)

    if (!name) {
        return NextResponse.json({ error: "Falta name" }, { status: 400 })
    }
    if (!specFieldKey) {
        return NextResponse.json({ error: "Falta spec_field_key" }, { status: 400 })
    }
    if (!Array.isArray(b.options) || b.options.length === 0) {
        return NextResponse.json({ error: "Faltan options" }, { status: 400 })
    }

    const options: MaterialFamilyPayload["options"] = []
    for (const item of b.options) {
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
            return NextResponse.json({ error: `Material inválido para la variante "${specValue}"` }, { status: 400 })
        }
        options.push({
            spec_value: specValue,
            material_id: materialId,
            is_default: Boolean(o.is_default),
        })
    }

    const payload: MaterialFamilyPayload = {
        name,
        spec_field_key: specFieldKey,
        default_spec_value: defaultSpecValue,
        cost_strategy: costStrategy,
        cost_material_id: Number.isFinite(costMaterialId) ? costMaterialId : null,
        options,
    }

    const result = await insertMaterialFamily(null, payload)
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, id: result.id })
}
