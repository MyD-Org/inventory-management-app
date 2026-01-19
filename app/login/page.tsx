import { LoginForm } from '@/components/login-form';
import { Suspense } from 'react';
import { Package } from 'lucide-react';

export default function LoginPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="flex flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                        <Package className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
                        Bienvenido de nuevo
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Ingrese sus credenciales para acceder al sistema
                    </p>
                </div>
                <Suspense>
                    <LoginForm />
                </Suspense>
            </div>
        </main>
    );
}
