import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { formatArs } from "@/lib/format"
import { totalesPorCategoria, type CategoriaGasto, type GastoRow } from "@/lib/gastos"
import { GastosClient } from "@/components/gastos-client"
import { ExpenseCategoriesManager } from "@/components/expense-categories"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

export const dynamic = "force-dynamic"

const NOMBRES_MES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

// Paleta de la marca para las barras del resumen (cicla si hay más categorías).
const COLORES_BARRA = ["#2b2018", "#8a6d4b", "#b3936b", "#c9a876", "#d9c4a3", "#e8dcc8"]

function mesActual(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function mesOffset(mes: string, delta: number): string {
    const [y, m] = mes.split("-").map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default async function GastosPage({
    searchParams,
}: {
    searchParams: { mes?: string }
}) {
    const session = await auth()
    if (!session?.user) redirect("/login")
    if (session.user.role !== "admin") redirect("/")

    const rawMes = typeof searchParams.mes === "string" ? searchParams.mes : ""
    const mes = /^\d{4}-\d{2}$/.test(rawMes) ? rawMes : mesActual()

    // DATE y NUMERIC llegan como string del driver; los casts ::text lo hacen
    // explícito y el cliente recibe JSON serializable.
    const expenses = (await sql`
        SELECT e.id, e.expense_date::text AS expense_date, e.description,
               e.amount::text AS amount, e.payment_method, e.category_id,
               c.name AS category_name
        FROM expenses e
        JOIN expense_categories c ON c.id = e.category_id
        WHERE to_char(e.expense_date, 'YYYY-MM') = ${mes}
        ORDER BY e.expense_date DESC, e.id DESC
    `) as unknown as GastoRow[]

    const categories = (await sql`
        SELECT id, name, active FROM expense_categories ORDER BY lower(name)
    `) as unknown as CategoriaGasto[]

    const totalMes = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
    const totales = totalesPorCategoria(expenses)

    return (
        <div className="bg-background">
            <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Gastos</h1>
                        <p className="mt-1 text-sm text-muted-foreground">Gastos operativos de la empresa</p>
                    </div>
                    <ExpenseCategoriesManager categories={categories} />
                </div>

                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <Link href={`/gastos?mes=${mesOffset(mes, -1)}`} aria-label="Mes anterior">
                                <ChevronLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <span className="px-2 text-lg font-semibold capitalize">
                            {NOMBRES_MES[Number(mes.slice(5)) - 1]} {mes.slice(0, 4)}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <Link href={`/gastos?mes=${mesOffset(mes, 1)}`} aria-label="Mes siguiente">
                                <ChevronRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                    <div className="text-right">
                        <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                            Total del mes
                        </p>
                        <p className="text-3xl font-bold tabular-nums">{formatArs(totalMes)}</p>
                    </div>
                </div>

                <section>
                    <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                        Por categoría
                    </p>
                    {totales.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {totales.map((t, i) => (
                                <div key={t.category_id}>
                                    <div className="mb-1 flex items-baseline justify-between text-sm">
                                        <span className="font-medium">{t.nombre}</span>
                                        <span className="tabular-nums text-muted-foreground">
                                            {formatArs(t.monto)} · {Math.round(t.pct * 100)}%
                                        </span>
                                    </div>
                                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${t.pct * 100}%`,
                                                background: COLORES_BARRA[i % COLORES_BARRA.length],
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                        Detalle del mes
                    </p>
                    <GastosClient expenses={expenses} categories={categories} />
                </section>
            </main>
        </div>
    )
}
