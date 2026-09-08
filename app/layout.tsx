import type React from "react"
import type { Metadata, Viewport } from "next"
import { Archivo, IBM_Plex_Mono, Public_Sans } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "next-themes"
import { Suspense } from "react"
import "./globals.css"

// Public Sans para leer, Archivo para los títulos, Plex Mono para los números.
const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
})
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
})
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Sistema de Inventario - Componentes de Iluminación",
  description: "Gestión de stock de materias primas con código de barras",
  generator: "v0.app",
  manifest: "/manifest.webmanifest",
  // iOS no lee el manifest: sin esto, "Agregar a inicio" abre una pestaña de
  // Safari con barra de direcciones en vez de la app a pantalla completa.
  appleWebApp: {
    capable: true,
    title: "Inventario",
    // "default" y no "black-translucent": el translúcido mete el reloj y la
    // batería ENCIMA de la barra de la app, justo arriba del botón del menú.
    statusBarStyle: "default",
  },
}

// Se comporta como app y no como página: sin zoom (ni pellizco ni el doble
// toque, que en una pantalla de botones grandes se dispara solo al tocar
// rápido) y ancho fijo al del dispositivo.
//
// El costo es real: quien necesite agrandar el texto pierde el pellizco. Queda
// el tamaño de letra del sistema, que la app respeta porque todo está en rem.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
  ],
}

import { Toaster } from "@/components/ui/sonner"
import { AiAssistant } from "@/components/ai-assistant"
import { RegisterSW } from "@/components/register-sw"
import { cookies } from "next/headers"
import { auth } from "@/auth"
import { getFlags } from "@/lib/feature-flags"
import { SIMPLE_VIEW_COOKIE } from "@/lib/view-mode"

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // El asistente de IA solo se monta para ADMINISTRADORES logueados
  // (no aparece en /login ni para usuarios sin rol admin) y detrás del flag "ai-widget".
  // Uso getFlags() (no aiWidgetFlag() directo) para pasar por su try/catch de seguridad.
  const [session, flags] = await Promise.all([auth(), getFlags()])
  // Tampoco en la vista simple: esa es la pantalla del operario, y la burbuja
  // flotante tapa el botón de la pantalla abajo a la derecha.
  const vistaSimple = cookies().get(SIMPLE_VIEW_COOKIE)?.value === "1"
  const isAdmin = session?.user?.role === "admin" && !vistaSimple
  const aiWidgetEnabled = flags.ai_widget

  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`font-sans ${publicSans.variable} ${archivo.variable} ${plexMono.variable}`}>
        <Suspense fallback={null}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
            <Toaster />
            <RegisterSW />
            {isAdmin && aiWidgetEnabled && <AiAssistant />}
          </ThemeProvider>
        </Suspense>
        <Analytics />
      </body>
    </html>
  )
}
