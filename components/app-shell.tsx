"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  LayoutGrid,
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  PlusCircle,
  Calculator,
  FileSpreadsheet,
  BarChart3,
  ArrowLeftRight,
  HardHat,
  Settings,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { StockMovementDialog } from "@/components/stock-movement-dialog"
import { Plus } from "lucide-react"

interface Material {
  id: number
  name: string
  barcode: string
  current_stock?: number
  unit_of_measure?: string
}

interface AppShellProps {
  user?: {
    name?: string | null
    email?: string | null
    role?: string
  }
  materials?: Material[]
  children: ReactNode
}

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  adminOnly?: boolean
  activePrefixes?: string[]
  quickAction?: "entrada" | "salida"
}

interface NavSection {
  title?: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    items: [{ label: "Dashboard", href: "/", icon: LayoutGrid }],
  },
  {
    title: "Operaciones",
    items: [
      { label: "Entrada de Stock", href: "/stock/entrada", icon: ArrowDownToLine, quickAction: "entrada" },
      { label: "Salida de Stock", href: "/stock/salida", icon: ArrowUpFromLine, quickAction: "salida" },
    ],
  },
  {
    title: "Gestión",
    items: [
      { label: "Inventario", href: "/inventory", icon: Package, activePrefixes: ["/materials/"] },
      { label: "Nuevo Material", href: "/materials/nuevo", icon: PlusCircle },
      { label: "Calcular Costos", href: "/costos", icon: Calculator, activePrefixes: ["/costos/"] },
      { label: "Mano de Obra", href: "/settings/recursos", icon: HardHat, adminOnly: true },
      // Presupuestos oculto temporalmente (del menú y de la IA). Para reactivar, descomentar
      // esta línea y las tools/prompt de presupuestos en components/ai-assistant.tsx.
      // { label: "Presupuestos", href: "/presupuestos", icon: FileSpreadsheet, activePrefixes: ["/presupuestos/"] },
    ],
  },
  {
    title: "Análisis",
    items: [
      { label: "Movimientos", href: "/movimientos", icon: ArrowLeftRight },
      { label: "Gráficos", href: "/graficos", icon: BarChart3 },
      // AI dashboard builder: dashboards armados por chat (solo admins, como el asistente).
      { label: "Dashboards IA", href: "/dashboards", icon: LayoutDashboard, adminOnly: true, activePrefixes: ["/dashboards/"] },
    ],
  },
  {
    title: "Administración",
    items: [
      { label: "Configuración", href: "/settings", icon: Settings, activePrefixes: ["/settings/"] },
    ],
  },
]

const allItems = sections.flatMap((section) => section.items)

function isItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true
  // Si otra entrada del menú coincide exactamente con la ruta, esa gana
  if (allItems.some((other) => other.href === pathname)) return false
  return item.activePrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false
}

function SidebarContent({ user, materials = [] }: { user?: AppShellProps["user"]; materials?: Material[] }) {
  const pathname = usePathname()
  const isAdmin = user?.role === "admin"
  const initials = user?.name?.slice(0, 2).toUpperCase() || "US"
  const [quickDialog, setQuickDialog] = useState<"entrada" | "salida" | null>(null)

  return (
    <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <Link href="/" className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2b2018]">
          <Package className="h-6 w-6 text-[#f3ead9]" />
        </div>
        <div>
          <p className="text-base font-bold leading-tight">Sistema de Inventario</p>
          <p className="text-xs text-sidebar-foreground/60">Materias Primas</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {sections.map((section, i) => {
          const items = section.items.filter((item) => !item.adminOnly || isAdmin)
          if (items.length === 0) return null
          return (
            <div key={section.title ?? i}>
              {section.title && (
                <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {items.map((item) => {
                  const active = isItemActive(item, pathname)
                  return (
                    <div
                      key={item.href}
                      className={`group flex items-center gap-1 rounded-lg pl-3 pr-1.5 py-1 text-sm transition-colors ${
                        active
                          ? "bg-[#2b2018] font-medium text-[#f3ead9]"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <Link href={item.href} className="flex flex-1 items-center gap-3 py-1 min-w-0">
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="rounded bg-[#2b2018] px-1.5 py-0.5 text-[10px] font-bold text-[#f3ead9]">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                      {item.quickAction && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setQuickDialog(item.quickAction!)
                          }}
                          title={item.quickAction === "entrada" ? "Registrar entrada" : "Registrar salida"}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                            active
                              ? "bg-white/20 text-white hover:bg-white/30"
                              : "bg-[#8a6d4b]/15 text-[#8a6d4b] hover:bg-[#8a6d4b]/25 dark:text-[#c9a876]"
                          }`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {user && (
        <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2b2018] text-xs font-bold text-[#f3ead9]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {user.role === "admin" ? "Admin" : "Operador"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => signOut()}
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      )}

      <StockMovementDialog
        type="entrada"
        materials={materials}
        open={quickDialog === "entrada"}
        onOpenChange={(open) => !open && setQuickDialog(null)}
      />
      <StockMovementDialog
        type="salida"
        materials={materials}
        open={quickDialog === "salida"}
        onOpenChange={(open) => !open && setQuickDialog(null)}
      />
    </div>
  )
}

function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const [date, setDate] = useState("")

  useEffect(() => {
    setDate(
      new Date().toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    )
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} title="Abrir menú">
        <Menu className="h-5 w-5" />
      </Button>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{date}</p>
      <div className="flex-1" />
      <ThemeToggle />
    </header>
  )
}

export function AppShell({ user, materials, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar fijo en desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarContent user={user} materials={materials} />
      </aside>

      {/* Sidebar como drawer en mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-64">
            <SidebarContent user={user} materials={materials} />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-4 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => setMobileOpen(false)}
              title="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </Button>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        {children}
      </div>
    </div>
  )
}
