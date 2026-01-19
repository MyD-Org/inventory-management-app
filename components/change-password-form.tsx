'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { changePassword } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Lock } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

export function ChangePasswordForm() {
    const [state, dispatch] = useFormState(changePassword, undefined);
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (state === 'Contraseña actualizada correctamente.') {
            toast("Éxito", {
                description: state,
            });
            formRef.current?.reset();
        } else if (state) {
            toast("Error", {
                description: state,
                action: {
                    label: "Cerrar",
                    onClick: () => console.log("Undo"),
                },
            });
        }
    }, [state, toast]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Cambiar Contraseña</CardTitle>
                <CardDescription>
                    Asegúrese de usar una contraseña segura.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form ref={formRef} action={dispatch} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Contraseña Actual</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="currentPassword"
                                type="password"
                                name="currentPassword"
                                required
                                className="pl-9"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="newPassword">Nueva Contraseña</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="newPassword"
                                type="password"
                                name="newPassword"
                                required
                                minLength={6}
                                className="pl-9"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirmar Nueva Contraseña</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="confirmPassword"
                                type="password"
                                name="confirmPassword"
                                required
                                minLength={6}
                                className="pl-9"
                            />
                        </div>
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
