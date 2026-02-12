"use client"

import { usePathname, useRouter } from "next/navigation"
import { Package, Settings, ArrowLeft, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export function DashboardHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const isHomePage = pathname === "/"

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isHomePage && (
              <div className="flex items-center gap-1 mr-2">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => router.back()}
                  title="Volver atrás"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => router.push("/")}
                  title="Ir al inicio"
                >
                  <Home className="w-4 h-4" />
                </Button>
              </div>
            )}
            <div 
              className="flex items-center gap-3 cursor-pointer" 
              onClick={() => router.push("/")}
            >
              <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-lg">
                <Package className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Sistema de Inventario</h1>
                <p className="text-sm text-muted-foreground">Gestión de Materias Primas - Componentes de Iluminación</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Configuración
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
