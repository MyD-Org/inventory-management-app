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

const tooltipContentStyle = {
    background: "rgba(15, 23, 42, 0.92)",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    borderRadius: 10,
    color: "#e2e8f0",
    padding: "10px 12px",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
}

const tooltipLabelStyle = {
    color: "#e2e8f0",
    fontWeight: 600,
}

const tooltipItemStyle = {
    color: "#cbd5f5",
}

interface ChartData {
    stockByCategory: any[]
    movementsByDay: any[]
    topMaterials: any[]
    stockStatus: any[]
}

export function InventoryChartsClient({ data }: { data: ChartData }) {
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
                            <BarChart data={data.stockByCategory} margin={{ left: 8, right: 8 }}>
                                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                                <XAxis
                                    dataKey="category"
                                    angle={-25}
                                    textAnchor="end"
                                    height={70}
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis tickLine={false} axisLine={false} width={40} />
                                <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                <Bar dataKey="stock" fill="#60a5fa" radius={[6, 6, 0, 0]} />
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
                    <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.stockStatus}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={95}
                                    innerRadius={58}
                                    paddingAngle={3}
                                    dataKey="count"
                                >
                                    {data.stockStatus.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Top Materiales con Más Movimientos */}
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Materiales con Más Actividad (Últimos 30 días)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.topMaterials} layout="vertical" margin={{ left: 16, right: 16 }}>
                                <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                                <XAxis type="number" tickLine={false} axisLine={false} />
                                <YAxis dataKey="name" type="category" width={170} fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                <Bar dataKey="entries" stackId="a" fill="#22c55e" name="Entradas" radius={[0, 6, 6, 0]} />
                                <Bar dataKey="exits" stackId="a" fill="#ef4444" name="Salidas" radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
