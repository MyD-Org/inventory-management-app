import { UsersTable } from "@/components/users-table"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { neon } from "@neondatabase/serverless"

async function getUsers() {
    const sql = neon(process.env.DATABASE_URL!);
    const users = await sql`SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC`;
    return users;
}

export default async function UsersPage() {
    const session = await auth();

    if (session?.user?.role !== 'admin') {
        redirect('/');
    }

    const users = await getUsers();

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Usuarios</h1>
                        <p className="text-muted-foreground">Gestiona el acceso al sistema</p>
                    </div>
                </div>

                <UsersTable initialUsers={users} />
            </main>
        </div>
    )
}
