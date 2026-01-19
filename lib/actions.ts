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
