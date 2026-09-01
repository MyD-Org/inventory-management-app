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
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  FileSpreadsheet,
  BarChart3,
  ArrowLeftRight,
  HardHat,
  Layers,
  Settings,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  BellRing,
  ClipboardList,
  ExternalLink,
  type LucideIcon,
} from "lucide-react"
import type { FlagKey } from "@/lib/feature-flags"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ThemeToggle } from "@/components/theme-toggle"
import { StockMovementDialog } from "@/components/stock-movement-dialog"
import { Plus } from "lucide-react"

interface Material {
  id: number
  name: string
  barcode: string
  current_stock?: number
  unit_of_measure?: string
  unit_cost?: number | string | null
}

interface AppShellProps {
  user?: {
    name?: string | null
    email?: string | null
    role?: string
  }
  materials?: Material[]
  flags?: Partial<Record<FlagKey, boolean>>
  /** Lo lee el layout de la cookie, para pintar el ancho correcto ya en el server. */
  defaultCollapsed?: boolean
  children: ReactNode
}

// Cookie y no localStorage: el layout (server component) la lee y el primer
// render ya sale con el ancho elegido, sin el salto de expandido a plegado.
export const SIDEBAR_COOKIE = "sidebar_collapsed"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  adminOnly?: boolean
  /** Si está seteado, el item solo se muestra cuando ese feature flag está habilitado. */
  flag?: FlagKey
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
      // Materias primas que vienen en variantes (tira LED por color, grampa por
      // largo): el mapeo variante -> material que usan las hojas de costo.
      { label: "Familias de Materiales", href: "/materials/familias", icon: Layers, adminOnly: true },
      { label: "Fichas de producto", href: "/fichas", icon: ClipboardList, activePrefixes: ["/fichas/"] },
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
      { label: "Dashboards IA", href: "/dashboards", icon: LayoutDashboard, adminOnly: true, flag: "ai_dashboards", activePrefixes: ["/dashboards/"] },
      // Automatizaciones: reutiliza la misma capability family que Dashboards IA
      // (flag 'ai_dashboards') — no hace falta un flag nuevo en Vercel.
      { label: "Automatizaciones", href: "/automations", icon: BellRing, adminOnly: true, flag: "ai_dashboards", activePrefixes: ["/automations/"] },
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

function SidebarContent({
  user,
  materials = [],
  flags = {},
  collapsed = false,
}: {
  user?: AppShellProps["user"]
  materials?: Material[]
  flags?: AppShellProps["flags"]
  collapsed?: boolean
}) {
  const pathname = usePathname()
  const isAdmin = user?.role === "admin"
  const initials = user?.name?.slice(0, 2).toUpperCase() || "US"
  const [quickDialog, setQuickDialog] = useState<"entrada" | "salida" | null>(null)

  return (
    <TooltipProvider delayDuration={0}>
    <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* El botón de plegar vive en la barra de arriba y no acá: metido en esta
          fila le comía el ancho al título y quedaba "Sistema de In…". */}
      <Link
        href="/"
        className={`flex items-center py-5 ${collapsed ? "justify-center px-2" : "gap-3 px-5"}`}
        title="Sistema de Inventario"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2b2018]">
          <Package className="h-6 w-6 text-[#f3ead9]" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight">Sistema de Inventario</p>
            <p className="text-xs text-sidebar-foreground/60">Materias Primas</p>
          </div>
        )}
      </Link>

      <nav className={`flex-1 space-y-5 overflow-y-auto py-2 ${collapsed ? "px-2" : "px-3"}`}>
        {sections.map((section, i) => {
          const items = section.items.filter(
            (item) => (!item.adminOnly || isAdmin) && (!item.flag || flags?.[item.flag]),
          )
          if (items.length === 0) return null
          return (
            <div key={section.title ?? i}>
              {/* Plegado no hay lugar para el título; la línea mantiene la
                  separación entre grupos, que es lo que el título hacía. */}
              {section.title &&
                (collapsed ? (
                  <div className="mx-2 mb-1.5 border-t border-sidebar-border" />
                ) : (
                  <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                    {section.title}
                  </p>
                ))}
              <div className="space-y-1">
                {items.map((item) => {
                  const active = isItemActive(item, pathname)
                  const estilo = active
                    ? "bg-[#2b2018] font-medium text-[#f3ead9]"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"

                  // Plegado: solo el ícono, centrado, y el nombre en un tooltip.
                  // El "+" de entrada/salida no entra en 64px y vuelve al expandir;
                  // la página a la que lleva el ícono tiene el alta igual.
                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                            className={`flex h-9 items-center justify-center rounded-lg transition-colors ${estilo}`}
                            aria-label={item.label}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    )
                  }

                  return (
                    <div
                      key={item.href}
                      className={`group flex items-center gap-1 rounded-lg pl-3 pr-1.5 py-1 text-sm transition-colors ${estilo}`}
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
        <div
          className={`flex border-t border-sidebar-border py-4 ${
            collapsed ? "flex-col items-center gap-2 px-2" : "items-center gap-3 px-4"
          }`}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2b2018] text-xs font-bold text-[#f3ead9]">
                {initials}
              </div>
            </TooltipTrigger>
            {/* Plegado el nombre no se ve; el tooltip es la única forma de saber
                con qué usuario estás trabajando. */}
            {collapsed && (
              <TooltipContent side="right">
                {user.name} · {user.role === "admin" ? "Admin" : "Operador"}
              </TooltipContent>
            )}
          </Tooltip>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">
                {user.role === "admin" ? "Admin" : "Operador"}
              </p>
            </div>
          )}
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
    </TooltipProvider>
  )
}

function TopBar({
  onMenuClick,
  collapsed,
  onToggleSidebar,
}: {
  onMenuClick: () => void
  collapsed: boolean
  onToggleSidebar: () => void
}) {
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
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={onToggleSidebar}
        title={collapsed ? "Expandir menú" : "Plegar menú"}
        aria-label={collapsed ? "Expandir menú" : "Plegar menú"}
      >
        {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </Button>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{date}</p>
      <div className="flex-1" />
      {/* El módulo de pedidos es de otro público (el taller) y tiene su propio
          layout: se abre en una pestaña aparte para no perder lo que estabas
          haciendo en inventario. */}
      <a href="/pedidos" target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm">
          <ClipboardList className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Pedidos</span>
          <ExternalLink className="ml-1.5 h-3 w-3 text-muted-foreground" />
        </Button>
      </a>
      <ThemeToggle />
    </header>
  )
}

export function AppShell({ user, materials, flags, defaultCollapsed = false, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const pathname = usePathname()

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Un año: es una preferencia de la persona, no algo de la sesión. Se escribe
  // en el momento del click para que la próxima carga ya venga con este ancho
  // desde el server (el layout la lee, ver SIDEBAR_COOKIE).
  function toggle() {
    setCollapsed((v) => {
      document.cookie = `${SIDEBAR_COOKIE}=${v ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`
      return !v
    })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar fijo en desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:block ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent user={user} materials={materials} flags={flags} collapsed={collapsed} />
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
            <SidebarContent user={user} materials={materials} flags={flags} />
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

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
        <TopBar onMenuClick={() => setMobileOpen(true)} collapsed={collapsed} onToggleSidebar={toggle} />
        {children}
      </div>
    </div>
  )
}
