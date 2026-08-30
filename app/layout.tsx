import type React from "react"
import type { Metadata } from "next"
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
}

import { Toaster } from "@/components/ui/sonner"
import { AiAssistant } from "@/components/ai-assistant"
import { auth } from "@/auth"
import { getFlags } from "@/lib/feature-flags"

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // El asistente de IA solo se monta para ADMINISTRADORES logueados
  // (no aparece en /login ni para usuarios sin rol admin) y detrás del flag "ai-widget".
  // Uso getFlags() (no aiWidgetFlag() directo) para pasar por su try/catch de seguridad.
  const [session, flags] = await Promise.all([auth(), getFlags()])
  const isAdmin = session?.user?.role === "admin"
  const aiWidgetEnabled = flags.ai_widget

  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`font-sans ${publicSans.variable} ${archivo.variable} ${plexMono.variable}`}>
        <Suspense fallback={null}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
            <Toaster />
            {isAdmin && aiWidgetEnabled && <AiAssistant />}
          </ThemeProvider>
        </Suspense>
        <Analytics />
      </body>
    </html>
  )
}
