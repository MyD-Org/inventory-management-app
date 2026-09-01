import NextAuth, { DefaultSession } from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
    interface Session {
        user: {
            role?: string
            id?: string
            /** Contraseña temporal puesta por un admin: hay que cambiarla para poder usar la app. */
            mustChangePassword?: boolean
        } & DefaultSession["user"]
    }

    interface User {
        role?: string
        /** Viene de la columna homónima de la tabla users, tal cual la devuelve authorize(). */
        must_change_password?: boolean
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        role?: string
        id?: string
        mustChangePassword?: boolean
    }
}
