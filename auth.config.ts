import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnLogin = nextUrl.pathname.startsWith('/login');

            if (isOnLogin) {
                if (isLoggedIn) return Response.redirect(new URL('/', nextUrl));
                return true;
            }

            if (!isLoggedIn) {
                return false; // Redirect unauthenticated users to login page
            }

            // Contraseña temporal (se la reseteó un admin): no entra a ninguna
            // pantalla hasta cambiarla. Es el único momento en que dos personas
            // conocen la misma clave, y dura lo que tarde en escribir otra.
            if (auth?.user?.mustChangePassword && !nextUrl.pathname.startsWith('/settings/security')) {
                return Response.redirect(new URL('/settings/security', nextUrl));
            }

            return true;
        },
        jwt({ token, user }) {
            if (user) {
                token.role = user.role;
                token.id = user.id;
                token.mustChangePassword = Boolean(user.must_change_password);
            }
            return token;
        },
        session({ session, token }) {
            if (session.user && token.role) {
                session.user.role = token.role as string;
                session.user.id = token.id as string;
            }
            if (session.user) {
                session.user.mustChangePassword = Boolean(token.mustChangePassword);
            }
            return session;
        },
    },
    providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
