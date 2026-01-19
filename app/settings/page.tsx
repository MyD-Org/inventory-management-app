import { DashboardHeader } from "@/components/dashboard-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Shield } from "lucide-react"
import Link from "next/link"
import { auth } from "@/auth"

export default async function SettingsPage() {
    const session = await auth();
    const isAdmin = session?.user?.role === 'admin';

    return (
        <div className="min-h-screen bg-background">
            <DashboardHeader user={session?.user} />
            <main className="container mx-auto px-4 py-6">
                <h1 className="text-2xl font-bold mb-6">Configuración</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isAdmin && (
                        <Link href="/settings/users">
                            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        Usuarios
                                    </CardTitle>
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">Gestión de Usuarios</div>
                                    <p className="text-xs text-muted-foreground">
                                        Agregar, eliminar y modificar permisos
                                    </p>
                                </CardContent>
                            </Card>
                        </Link>
                    )}

                    <Card className="opacity-50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Seguridad
                            </CardTitle>
                            <Shield className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">Permisos</div>
                            <p className="text-xs text-muted-foreground">
                                Configuración de roles (Próximamente)
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
