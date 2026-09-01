-- Contraseña temporal: marca que el usuario tiene que cambiarla al entrar.
--
-- La pone en TRUE el reseteo que hace un admin desde Configuración → Usuarios
-- (no había forma de recuperar una contraseña olvidada: el cambio exige saber
-- la actual, así que la única salida era borrar y recrear al usuario).
--
-- La apaga el propio usuario al cambiarla. Mientras esté en TRUE, el middleware
-- lo manda a /settings/security y no lo deja entrar a otra pantalla: una
-- contraseña que conocen dos personas no puede quedar dando vueltas.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
