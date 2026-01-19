"use client"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Search, Tag, Filter } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"

interface Category {
    id: number
    name: string
}

interface InventoryFiltersProps {
    categories: Category[]
}

export function InventoryFilters({ categories }: InventoryFiltersProps) {
    const searchParams = useSearchParams()
    const router = useRouter()

    const handleSearch = useDebouncedCallback((term: string) => {
        const params = new URLSearchParams(searchParams)
        if (term) {
            params.set("search", term)
        } else {
            params.delete("search")
        }
        router.replace(`?${params.toString()}`)
    }, 300)

    const handleCategoryChange = (value: string) => {
        const params = new URLSearchParams(searchParams)
        if (value && value !== "all") {
            params.set("category", value)
        } else {
            params.delete("category")
        }
        router.replace(`?${params.toString()}`)
    }

    const handleStatusChange = (value: string) => {
        const params = new URLSearchParams(searchParams)
        if (value && value !== "all") {
            params.set("status", value)
        } else {
            params.delete("status")
        }
        router.replace(`?${params.toString()}`)
    }

    return (
        <div className="flex flex-col md:flex-row gap-4 mb-6 items-end">
            <div className="relative flex-1">
                <Label className="mb-2 block text-xs text-muted-foreground">Búsqueda</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nombre o código..."
                        className="pl-10"
                        defaultValue={searchParams.get("search")?.toString()}
                        onChange={(e) => handleSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="w-full md:w-[200px]">
                <Label className="mb-2 block text-xs text-muted-foreground flex items-center gap-2">
                    <Tag className="w-3 h-3" /> Categoría
                </Label>
                <Select
                    defaultValue={searchParams.get("category")?.toString() || "all"}
                    onValueChange={handleCategoryChange}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas las categorías</SelectItem>
                        {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                                {category.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="w-full md:w-[200px]">
                <Label className="mb-2 block text-xs text-muted-foreground flex items-center gap-2">
                    <Filter className="w-3 h-3" /> Estado de Stock
                </Label>
                <Select
                    defaultValue={searchParams.get("status")?.toString() || "all"}
                    onValueChange={handleStatusChange}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los estados</SelectItem>
                        <SelectItem value="low">Stock Bajo</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">Stock Alto</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
