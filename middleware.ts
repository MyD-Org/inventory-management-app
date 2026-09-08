import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export default NextAuth(authConfig).auth;

export const config = {
    // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
    // .well-known excluido: ahí vive el discovery endpoint de Vercel Flags
    // (app/.well-known/vercel/flags/route.ts), que Flags Explorer necesita poder
    // leer sin depender de la sesión de la app.
    //
    // manifest.webmanifest y sw.js también quedan fuera: el navegador los pide
    // SIN sesión (el manifest incluso antes de que exista una) y si el
    // middleware los manda al login, el teléfono nunca ofrece instalar la app.
    //
    // Los iconos quedan fuera: el favicon se pide desde /login, donde por
    // definición no hay sesión, y el middleware lo redirigía al propio login.
    // Resultado: la pestaña se veía sin icono justo en la primera pantalla.
    matcher: ['/((?!api|_next/static|_next/image|.well-known|manifest.webmanifest|sw.js|.*\\.png$|.*\\.svg$|.*\\.ico$).*)'],
};
