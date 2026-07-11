import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LayoutDashboard, Plus } from "lucide-react"

export const dynamic = "force-dynamic"

// Lista de dashboards IA guardados. La creación/edición vive en /dashboards/nuevo y
// /dashboards/[id] (workspace con chat). Solo admins (mismo gate que el asistente).
export default async function DashboardsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  const rows = (await sql`
    SELECT id, name, created_by, updated_at FROM dashboards ORDER BY updated_at DESC
  `) as Array<{ id: number; name: string; created_by: string | null; updated_at: string }>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboards IA</h1>
        <Button asChild>
          <Link href="/dashboards/nuevo">
            <Plus className="mr-1 h-4 w-4" /> Nuevo dashboard
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <LayoutDashboard className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Todavía no hay dashboards. Creá el primero pidiéndoselo al asistente.
            </p>
            <Button asChild>
              <Link href="/dashboards/nuevo">Crear dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((d) => (
            <Link key={d.id} href={`/dashboards/${d.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle className="text-base">{d.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Actualizado {new Date(d.updated_at).toLocaleDateString("es-AR")}
                  {d.created_by ? ` · ${d.created_by}` : ""}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
