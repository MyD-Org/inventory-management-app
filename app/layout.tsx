import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "next-themes"
import { Suspense } from "react"
import "./globals.css"

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
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
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
