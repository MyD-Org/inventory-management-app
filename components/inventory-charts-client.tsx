"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts"

const COLORS = {
    Bajo: "#f87171",
    Normal: "#34d399",
    Alto: "#fbbf24",
    entrada: "#22c55e",
    salida: "#ef4444",
    ajuste: "#60a5fa",
}

const GRID_STROKE = "rgba(148, 163, 184, 0.18)"
const AXIS_TICK = { fontSize: 11, fill: "rgba(100, 116, 139, 0.9)" }
const BAR_CURSOR = { fill: "rgba(148, 163, 184, 0.08)" }

const compactNumber = (value: number) =>
    new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(value)

// Tooltip que respeta el tema claro/oscuro vía variables CSS
const tooltipContentStyle = {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--popover-foreground)",
    padding: "8px 12px",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.12)",
}

const tooltipLabelStyle = {
    color: "var(--popover-foreground)",
    fontWeight: 600,
    marginBottom: 2,
}

const tooltipItemStyle = {
    color: "var(--muted-foreground)",
}

interface ChartData {
    stockByCategory: any[]
    movementsByDay: any[]
    topMaterials: any[]
    stockStatus: any[]
}

// Pivota los movimientos por día en una serie {label, entrada, salida}
function buildDailySeries(rows: any[]) {
    const byDate = new Map<string, { date: string; entrada: number; salida: number }>()
    for (const r of rows) {
        const key = typeof r.date === "string" ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10)
        if (!byDate.has(key)) byDate.set(key, { date: key, entrada: 0, salida: 0 })
        const bucket = byDate.get(key)!
        if (r.type === "entrada") bucket.entrada += r.quantity
        else if (r.type === "salida") bucket.salida += r.quantity
    }
    return Array.from(byDate.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
            ...d,
            label: new Date(`${d.date}T00:00:00`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric" }),
        }))
}

export function InventoryChartsClient({ data }: { data: ChartData }) {
    // const dailySeries = buildDailySeries(data.movementsByDay) // gráfico últimos 7 días oculto
    const totalStockItems = data.stockStatus.reduce((sum, s) => sum + Number(s.count || 0), 0)

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stock por Categoría */}
            <Card>
                <CardHeader>
                    <CardTitle>Stock por Categoría</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.stockByCategory} margin={{ left: 4, right: 12, top: 8 }}>
                                <defs>
                                    <linearGradient id="stockBarGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.95} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.55} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                                <XAxis
                                    dataKey="category"
                                    angle={-25}
                                    textAnchor="end"
                                    height={70}
                                    tick={AXIS_TICK}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    width={48}
                                    tick={AXIS_TICK}
                                    tickFormatter={compactNumber}
                                />
                                <Tooltip
                                    cursor={BAR_CURSOR}
                                    contentStyle={tooltipContentStyle}
                                    labelStyle={tooltipLabelStyle}
                                    itemStyle={tooltipItemStyle}
                                />
                                <Bar dataKey="stock" fill="url(#stockBarGradient)" radius={[8, 8, 0, 0]} maxBarSize={44} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Estado del Stock */}
            <Card>
                <CardHeader>
                    <CardTitle>Estado del Stock</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative h-[320px] w-full">
                        {/* Total al centro de la dona */}
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold text-foreground">{totalStockItems.toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground">materiales</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.stockStatus}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={100}
                                    innerRadius={68}
                                    paddingAngle={4}
                                    cornerRadius={6}
                                    dataKey="count"
                                    stroke="var(--card)"
                                    strokeWidth={2}
                                >
                                    {data.stockStatus.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                <Legend
                                    verticalAlign="bottom"
                                    height={24}
                                    iconType="circle"
                                    formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Movimientos últimos 7 días — oculto a pedido */}
            {/* <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Movimientos (Últimos 7 días)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] w-full">
                        {dailySeries.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                No hay movimientos en los últimos 7 días
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailySeries} margin={{ left: 4, right: 12, top: 8 }} barGap={6}>
                                    <defs>
                                        <linearGradient id="entradaDayGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.95} />
                                            <stop offset="100%" stopColor="#16a34a" stopOpacity={0.6} />
                                        </linearGradient>
                                        <linearGradient id="salidaDayGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.95} />
                                            <stop offset="100%" stopColor="#dc2626" stopOpacity={0.6} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={compactNumber} />
                                    <Tooltip cursor={BAR_CURSOR} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                    <Legend iconType="circle" formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
                                    <Bar dataKey="entrada" name="Entradas" fill="url(#entradaDayGradient)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                                    <Bar dataKey="salida" name="Salidas" fill="url(#salidaDayGradient)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </CardContent>
            </Card> */}

            {/* Top Materiales con Más Movimientos */}
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Materiales con Más Actividad (Últimos 30 días)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.topMaterials} layout="vertical" margin={{ left: 16, right: 16 }}>
                                <defs>
                                    <linearGradient id="entradaBarGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#16a34a" stopOpacity={0.85} />
                                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.95} />
                                    </linearGradient>
                                    <linearGradient id="salidaBarGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.85} />
                                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.95} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                                <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={compactNumber} />
                                <YAxis dataKey="name" type="category" width={170} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                                <Tooltip cursor={BAR_CURSOR} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                <Legend iconType="circle" formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
                                <Bar dataKey="entries" stackId="a" fill="url(#entradaBarGradient)" name="Entradas" maxBarSize={26} />
                                <Bar dataKey="exits" stackId="a" fill="url(#salidaBarGradient)" name="Salidas" radius={[0, 6, 6, 0]} maxBarSize={26} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
