'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Credenciales inválidas.';
                default:
                    return 'Algo salió mal.';
            }
        }
        throw error;
    }
}

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

export async function createUser(formData: FormData) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const sql = neon(process.env.DATABASE_URL!);

    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const role = formData.get('role') as string;

    if (!name || !email || !password || !role) {
        return { error: 'Faltan campos requeridos' };
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        await sql`
      INSERT INTO users (name, email, password, role)
      VALUES (${name}, ${email}, ${hashedPassword}, ${role})
    `;

        revalidatePath('/settings/users');
        return { success: true };
    } catch (error) {
        console.error('Error creating user:', error);
        return { error: 'Error al crear usuario. El email podría estar duplicado.' };
    }
}

export async function deleteUser(userId: number) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const sql = neon(process.env.DATABASE_URL!);

    try {
        await sql`DELETE FROM users WHERE id = ${userId}`;
        revalidatePath('/settings/users');
        return { success: true };
    } catch (error) {
        console.error('Error deleting user:', error);
        return { error: 'Error al eliminar usuario' };
    }
}

import { auth } from '@/auth';

export async function changePassword(prevState: string | undefined, formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) {
        return 'No estás autenticado.';
    }

    const currentPassword = formData.get('currentPassword') as string;
    const newPassword = formData.get('newPassword') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return 'Todos los campos son obligatorios.';
    }

    if (newPassword !== confirmPassword) {
        return 'Las nuevas contraseñas no coinciden.';
    }

    if (newPassword.length < 6) {
        return 'La contraseña debe tener al menos 6 caracteres.';
    }

    const sql = neon(process.env.DATABASE_URL!);

    try {
        // Fetch user to get current password hash
        const users = await sql`SELECT password FROM users WHERE email = ${session.user.email}`;
        if (users.length === 0) {
            return 'Usuario no encontrado.';
        }

        const user = users[0];
        const passwordsMatch = await bcrypt.compare(currentPassword, user.password);

        if (!passwordsMatch) {
            return 'La contraseña actual es incorrecta.';
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await sql`
            UPDATE users 
            SET password = ${hashedPassword} 
            WHERE email = ${session.user.email}
        `;

        return 'Contraseña actualizada correctamente.';
    } catch (error) {
        console.error('Error changing password:', error);
        return 'Error al cambiar la contraseña.';
    }
}

export async function createCategory(formData: FormData) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const sql = neon(process.env.DATABASE_URL!);
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    if (!name) return { error: 'El nombre es requerido' };

    try {
        await sql`INSERT INTO categories (name, description) VALUES (${name}, ${description})`;
        revalidatePath('/settings/categories');
        revalidatePath('/materials/nuevo');
        return { success: true };
    } catch (error) {
        console.error('Error creating category:', error);
        return { error: 'Error al crear la categoría' };
    }
}

export async function deleteCategory(id: number) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const sql = neon(process.env.DATABASE_URL!);
    try {
        await sql`DELETE FROM categories WHERE id = ${id}`;
        revalidatePath('/settings/categories');
        return { success: true };
    } catch (error) {
        console.error('Error deleting category:', error);
        return { error: 'No se puede eliminar la categoría porque tiene materiales asociados' };
    }
}

export async function createSupplier(formData: FormData) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const sql = neon(process.env.DATABASE_URL!);
    const name = formData.get('name') as string;
    const contact_info = formData.get('contact_info') as string;

    if (!name) return { error: 'El nombre es requerido' };

    try {
        const columns = await sql`
            SELECT column_name 
            FROM information_schema.columns
            WHERE table_name = 'suppliers'
        `;
        const columnNames = new Set(columns.map((row: any) => row.column_name));

        if (columnNames.has("address")) {
            await sql`INSERT INTO suppliers (name, address) VALUES (${name}, ${contact_info || null})`;
        } else if (columnNames.has("contact_info")) {
            await sql`INSERT INTO suppliers (name, contact_info) VALUES (${name}, ${contact_info || null})`;
        } else {
            await sql`INSERT INTO suppliers (name) VALUES (${name})`;
        }
        revalidatePath('/settings/suppliers');
        revalidatePath('/materials/nuevo');
        return { success: true };
    } catch (error) {
        console.error('Error creating supplier:', error);
        return { error: 'Error al crear el proveedor' };
    }
}

export async function deleteSupplier(id: number) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const sql = neon(process.env.DATABASE_URL!);
    try {
        await sql`DELETE FROM suppliers WHERE id = ${id}`;
        revalidatePath('/settings/suppliers');
        return { success: true };
    } catch (error) {
        console.error('Error deleting supplier:', error);
        return { error: 'No se puede eliminar el proveedor porque tiene materiales asociados' };
    }
}

export async function downloadInventoryReport() {
    const sql = neon(process.env.DATABASE_URL!);
    try {
        const data = await sql`
            SELECT 
                m.barcode,
                m.name,
                c.name as category,
                s.name as supplier,
                i.current_stock,
                m.unit_of_measure,
                m.unit_cost,
                (i.current_stock * m.unit_cost) as total_value
            FROM materials m
            JOIN inventory i ON m.id = i.material_id
            LEFT JOIN categories c ON m.category_id = c.id
            LEFT JOIN suppliers s ON m.supplier_id = s.id
            ORDER BY m.name ASC
        `;
        return data;
    } catch (error) {
        console.error('Error fetching inventory report:', error);
        return [];
    }
}

export async function downloadMovementsReport(params?: { search?: string; type?: string; from?: string; to?: string }) {
    const sql = neon(process.env.DATABASE_URL!);
    const { search, type, from, to } = params || {};

    try {
        const searchVal = search ? `%${search}%` : null;
        const typeVal = type || 'all';
        const fromVal = from ? new Date(from).toISOString() : null;
        const toVal = to ? new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString() : null;

        const data = await sql`
            SELECT 
                sm.id,
                sm.movement_type,
                sm.quantity,
                sm.previous_stock,
                sm.new_stock,
                sm.reference_number,
                sm.notes,
                sm.user_name,
                sm.created_at,
                m.name as material_name,
                m.barcode,
                c.name as category_name
            FROM stock_movements sm
            JOIN materials m ON sm.material_id = m.id
            LEFT JOIN categories c ON m.category_id = c.id
            WHERE 
                (${searchVal}::text IS NULL OR (m.name ILIKE ${searchVal}::text OR m.barcode ILIKE ${searchVal}::text OR sm.reference_number ILIKE ${searchVal}::text))
                AND (${typeVal}::text = 'all' OR sm.movement_type = ${typeVal}::text)
                AND (${fromVal}::text IS NULL OR sm.created_at >= ${fromVal}::timestamp)
                AND (${toVal}::text IS NULL OR sm.created_at <= ${toVal}::timestamp)
            ORDER BY sm.created_at DESC
        `;

        return data;
    } catch (error) {
        console.error('Error fetching movements report:', error);
        return [];
    }
}

export async function previewInventoryUpdates(items: { barcode: string; newStock: number; newCost?: number }[]) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const sql = neon(process.env.DATABASE_URL!);
    const updates = [];

    try {
        for (const item of items) {
            // Find material and current stock
            const result = await sql`
                SELECT m.id, m.name, m.barcode, m.unit_cost, i.current_stock 
                FROM materials m
                JOIN inventory i ON m.id = i.material_id
                WHERE m.barcode = ${item.barcode}
            `;

            if (result.length > 0) {
                const currentStock = result[0].current_stock;
                const currentCost = parseFloat(result[0].unit_cost);
                const newStock = item.newStock;
                const newCost = item.newCost !== undefined ? item.newCost : currentCost;

                if (currentStock !== newStock || Math.abs(currentCost - newCost) > 0.01) {
                    updates.push({
                        id: result[0].id,
                        name: result[0].name,
                        barcode: result[0].barcode,
                        currentStock,
                        newStock,
                        currentCost,
                        newCost,
                        difference: newStock - currentStock
                    });
                }
            }
        }
        return { updates };
    } catch (error) {
        console.error('Error previewing updates:', error);
        return { error: 'Error al analizar el archivo' };
    }
}

export async function executeInventoryUpdates(updates: { id: number; newStock: number; newCost: number; difference: number }[]) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return { error: 'No tienes permisos para realizar esta acción' };
    }

    const sql = neon(process.env.DATABASE_URL!);

    try {
        for (const update of updates) {
            // Update inventory
            await sql`
                UPDATE inventory 
                SET current_stock = ${update.newStock}
                WHERE material_id = ${update.id}
            `;

            // Update cost if changed
            await sql`
                UPDATE materials
                SET unit_cost = ${update.newCost}
                WHERE id = ${update.id}
            `;

            // Record movement only if stock changed
            if (update.difference !== 0) {
                const type = update.difference > 0 ? 'entrada' : 'salida';

                await sql`
                    INSERT INTO stock_movements (
                        material_id, 
                        movement_type, 
                        quantity, 
                        previous_stock, 
                        new_stock, 
                        notes, 
                        user_name
                    ) VALUES (
                        ${update.id}, 
                        ${type}, 
                        ${Math.abs(update.difference)}, 
                        ${update.newStock - update.difference}, 
                        ${update.newStock}, 
                        'Actualización masiva por archivo', 
                        ${session.user.name || 'Admin'}
                    )
                `;
            }
        }

        revalidatePath('/inventory');
        return { success: true, count: updates.length };
    } catch (error) {
        console.error('Error executing updates:', error);
        return { error: 'Error al aplicar los cambios' };
    }
}
