"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

const COLORS = {
    Bajo: "#ef4444",
    Normal: "#22c55e",
    Alto: "#f59e0b",
    entrada: "#22c55e",
    salida: "#ef4444",
    ajuste: "#3b82f6",
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
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.stockByCategory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="category" angle={-45} textAnchor="end" height={80} fontSize={12} />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="stock" fill="#3b82f6" />
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
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.stockStatus}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ status, count, percent }) => `${status}: ${count} (${(percent * 100).toFixed(0)}%)`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="count"
                                >
                                    {data.stockStatus.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS]} />
                                    ))}
                                </Pie>
                                <Tooltip />
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
                            <BarChart data={data.topMaterials} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={150} fontSize={12} />
                                <Tooltip />
                                <Bar dataKey="entries" stackId="a" fill="#22c55e" name="Entradas" />
                                <Bar dataKey="exits" stackId="a" fill="#ef4444" name="Salidas" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
