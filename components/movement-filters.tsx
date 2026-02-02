"use client"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"

export function MovementFilters() {
    const searchParams = useSearchParams()
    const router = useRouter()

    const handleSearch = useDebouncedCallback((term: string) => {
        const params = new URLSearchParams(searchParams)
        if (term) {
            params.set("q", term)
        } else {
            params.delete("q")
        }
        router.replace(`?${params.toString()}`, { scroll: false })
    }, 300)

    const handleTypeChange = (value: string) => {
        const params = new URLSearchParams(searchParams)
        if (value && value !== "all") {
            params.set("type", value)
        } else {
            params.delete("type")
        }
        router.replace(`?${params.toString()}`, { scroll: false })
    }

    return (
        <div className="flex gap-4 mt-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar por material o código..." 
                    className="pl-10" 
                    defaultValue={searchParams.get("q")?.toString()}
                    onChange={(e) => handleSearch(e.target.value)}
                />
            </div>
            <Select 
                defaultValue={searchParams.get("type")?.toString() || "all"} 
                onValueChange={handleTypeChange}
            >
                <SelectTrigger className="w-48">
                    <SelectValue placeholder="Tipo de movimiento" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="entrada">Entradas</SelectItem>
                    <SelectItem value="salida">Salidas</SelectItem>
                    <SelectItem value="ajuste">Ajustes</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}
