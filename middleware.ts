import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export default NextAuth(authConfig).auth;

export const config = {
    // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
    // .well-known excluido: ahí vive el discovery endpoint de Vercel Flags
    // (app/.well-known/vercel/flags/route.ts), que Flags Explorer necesita poder
    // leer sin depender de la sesión de la app.
    matcher: ['/((?!api|_next/static|_next/image|.well-known|.*\\.png$).*)'],
};
