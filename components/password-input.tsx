'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Lock, Eye, EyeOff } from 'lucide-react';

/**
 * Campo de contraseña con candado a la izquierda y "ojito" a la derecha para
 * alternar entre texto y puntos. El type lo maneja el propio componente, así
 * que no se puede pasar desde afuera.
 */
export function PasswordInput({
    className,
    ...props
}: Omit<React.ComponentProps<typeof Input>, 'type'>) {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
        <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
                {...props}
                type={showPassword ? 'text' : 'password'}
                className={cn('pl-9 pr-9', className)}
            />
            <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                className="absolute right-3 top-3 rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    );
}
