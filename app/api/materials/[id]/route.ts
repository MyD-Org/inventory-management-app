import { neon } from "@neondatabase/serverless"
import { NextRequest, NextResponse } from "next/server"

const sql = neon(process.env.DATABASE_URL!)

export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id
        const body = await request.json()
        const {
            name,
            barcode,
            description,
            category_id,
            supplier_id,
            unit_of_measure,
            unit_cost,
            min_stock,
            max_stock,
        } = body

        if (!name || !category_id || !supplier_id) {
            return NextResponse.json(
                { error: "Nombre, categoría y proveedor son obligatorios" },
                { status: 400 }
            )
        }

        // Verificar si el código de barras ya existe (excluyendo el actual)
        if (barcode) {
            const existing = await sql`
        SELECT id FROM materials 
        WHERE barcode = ${barcode} AND id != ${id}
      `
            if (existing.length > 0) {
                return NextResponse.json(
                    { error: "El código de barras ya existe en otro material" },
                    { status: 400 }
                )
            }
        }

        // Actualizar el material
        await sql`
      UPDATE materials 
      SET 
        name = ${name}, 
        barcode = ${barcode}, 
        description = ${description}, 
        category_id = ${category_id}, 
        supplier_id = ${supplier_id}, 
        unit_of_measure = ${unit_of_measure}, 
        unit_cost = ${unit_cost || 0}, 
        min_stock = ${min_stock || 10}, 
        max_stock = ${max_stock || 100},
        updated_at = NOW()
      WHERE id = ${id}
    `

        return NextResponse.json({
            success: true,
            message: "Material actualizado exitosamente"
        })
    } catch (error) {
        console.error("Error updating material:", error)
        return NextResponse.json(
            { error: "Error al actualizar el material" },
            { status: 500 }
        )
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id

        // Verificar si tiene movimientos o stock
        const inventory = await sql`
      SELECT current_stock FROM inventory WHERE material_id = ${id}
    `

        if (inventory.length > 0 && inventory[0].current_stock > 0) {
            return NextResponse.json(
                { error: "No se puede eliminar un material con stock existente" },
                { status: 400 }
            )
        }

        // Eliminar (primero inventario y movimientos si los hubiera, luego material)
        // Nota: Esto depende de las FK constraints. Si son CASCADE, basta con borrar material.
        // Asumiremos que necesitamos limpiar manualmente por seguridad o dejar que falle si hay dependencias.

        // Intentamos borrar. Si falla por FK, el catch lo atrapará.
        await sql`DELETE FROM inventory WHERE material_id = ${id}`
        await sql`DELETE FROM stock_movements WHERE material_id = ${id}`
        await sql`DELETE FROM materials WHERE id = ${id}`

        return NextResponse.json({
            success: true,
            message: "Material eliminado exitosamente"
        })
    } catch (error) {
        console.error("Error deleting material:", error)
        return NextResponse.json(
            { error: "Error al eliminar el material. Puede que tenga movimientos asociados." },
            { status: 500 }
        )
    }
}
