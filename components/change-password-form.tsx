'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { changePassword } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';

export function ChangePasswordForm({ temporal = false }: { temporal?: boolean }) {
    const [state, dispatch] = useFormState(changePassword, undefined);
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (state === 'Contraseña actualizada correctamente.') {
            toast("Éxito", {
                description: state,
            });
            formRef.current?.reset();
            // La marca de "contraseña temporal" viaja en el token, que se emitió al
            // entrar: sin cerrar sesión el middleware seguiría rebotando a esta misma
            // pantalla con la contraseña nueva ya guardada. Y de paso muere la sesión
            // que se abrió con una clave que conocían dos personas.
            if (temporal) {
                signOut({ callbackUrl: '/login' });
            }
        } else if (state) {
            toast("Error", {
                description: state,
                action: {
                    label: "Cerrar",
                    onClick: () => console.log("Undo"),
                },
            });
        }
    }, [state, toast, temporal]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Cambiar Contraseña</CardTitle>
                <CardDescription>
                    {temporal
                        ? 'Tu contraseña actual es temporal: la puso un administrador y la conocen dos personas. Elegí una nueva para poder usar el sistema.'
                        : 'Asegúrese de usar una contraseña segura.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form ref={formRef} action={dispatch} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Contraseña Actual</Label>
                        <PasswordInput
                            id="currentPassword"
                            name="currentPassword"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="newPassword">Nueva Contraseña</Label>
                        <PasswordInput
                            id="newPassword"
                            name="newPassword"
                            required
                            minLength={6}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirmar Nueva Contraseña</Label>
                        <PasswordInput
                            id="confirmPassword"
                            name="confirmPassword"
                            required
                            minLength={6}
                        />
                    </div>
                    <SubmitButton />
                </form>
            </CardContent>
        </Card>
    );
}

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Actualizando...
                </>
            ) : (
                'Actualizar Contraseña'
            )}
        </Button>
    );
}
