"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search, Calendar as CalendarIcon, X } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { DateRange, type SelectRangeEventHandler } from "react-day-picker"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useDebounce } from "use-debounce"
import { useMovementHistoryTransition } from "./movement-history-context"

export function MovementFilters({ hideTypeFilter = false }: { hideTypeFilter?: boolean }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const movementTransition = useMovementHistoryTransition()

    const [search, setSearch] = React.useState(searchParams.get("search") || "")
    const [debouncedSearch] = useDebounce(search, 500)
    const [type, setType] = React.useState(searchParams.get("type") || "all")

    const fromParam = searchParams.get("from")
    const toParam = searchParams.get("to")

    const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime())

    const [date, setDate] = React.useState<DateRange | undefined>(() => {
        const from = fromParam ? new Date(fromParam) : undefined
        const to = toParam ? new Date(toParam) : undefined

        return {
            from: from && isValidDate(from) ? from : undefined,
            to: to && isValidDate(to) ? to : undefined,
        }
    })
    const [debouncedDate] = useDebounce(date, 300)

    const updateFilters = React.useCallback(
        (newFilters: { search?: string; type?: string; from?: string; to?: string }) => {
            const params = new URLSearchParams(searchParams.toString())
            let didChange = false

            if (newFilters.search !== undefined) {
                const nextSearch = newFilters.search || ""
                const currentSearch = searchParams.get("search") || ""
                if (nextSearch !== currentSearch) {
                    if (nextSearch) params.set("search", nextSearch)
                    else params.delete("search")
                    didChange = true
                }
            }

            if (newFilters.type !== undefined) {
                const nextType = newFilters.type && newFilters.type !== "all" ? newFilters.type : ""
                const currentType = searchParams.get("type") || ""
                if (nextType !== currentType) {
                    if (nextType) params.set("type", nextType)
                    else params.delete("type")
                    didChange = true
                }
            }

            if (newFilters.from !== undefined) {
                const nextFrom = newFilters.from || ""
                const currentFrom = searchParams.get("from") || ""
                if (nextFrom !== currentFrom) {
                    if (nextFrom) params.set("from", nextFrom)
                    else params.delete("from")
                    didChange = true
                }
            }

            if (newFilters.to !== undefined) {
                const nextTo = newFilters.to || ""
                const currentTo = searchParams.get("to") || ""
                if (nextTo !== currentTo) {
                    if (nextTo) params.set("to", nextTo)
                    else params.delete("to")
                    didChange = true
                }
            }

            if (didChange) {
                params.set("page", "1")
            }

            const nextQuery = params.toString()
            const currentQuery = searchParams.toString()
            if (!didChange || nextQuery === currentQuery) return
            const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname
            if (movementTransition) {
                movementTransition.startTransition(() => {
                    router.push(nextUrl, { scroll: false })
                })
            } else {
                router.push(nextUrl, { scroll: false })
            }
        },
        [router, pathname, searchParams, movementTransition]
    )

    React.useEffect(() => {
        updateFilters({ search: debouncedSearch })
    }, [debouncedSearch, updateFilters])

    const handleTypeChange = (value: string) => {
        setType(value)
        updateFilters({ type: value })
    }

    const handleDateChange: SelectRangeEventHandler = (_range, selectedDay) => {
        if (!selectedDay) return

        if (!date?.from || (date?.from && date?.to)) {
            setDate({ from: selectedDay, to: undefined })
            return
        }

        if (selectedDay < date.from) {
            setDate({ from: selectedDay, to: date.from })
        } else {
            setDate({ from: date.from, to: selectedDay })
        }
    }

    const clearFilters = () => {
        setSearch("")
        setType("all")
        setDate(undefined)
        if (movementTransition) {
            movementTransition.startTransition(() => {
                router.push(pathname, { scroll: false })
            })
        } else {
            router.push(pathname, { scroll: false })
        }
    }

    React.useEffect(() => {
        const hasFrom = !!debouncedDate?.from
        const hasTo = !!debouncedDate?.to
        if (hasFrom && hasTo) {
            updateFilters({
                from: debouncedDate?.from?.toISOString(),
                to: debouncedDate?.to?.toISOString(),
            })
            return
        }
        if (!hasFrom && !hasTo) {
            updateFilters({ from: "", to: "" })
        }
    }, [debouncedDate, updateFilters])

    const hasFilters = search || type !== "all" || date?.from || date?.to

    return (
        <div className="flex flex-col gap-4 mt-4">
            <div className="flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por material o código..."
                        className="pl-10"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {!hideTypeFilter && (
                    <Select value={type} onValueChange={handleTypeChange}>
                        <SelectTrigger className="w-full sm:w-48">
                            <SelectValue placeholder="Tipo de movimiento" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los tipos</SelectItem>
                            <SelectItem value="entrada">Entradas</SelectItem>
                            <SelectItem value="salida">Salidas</SelectItem>
                            <SelectItem value="ajuste">Ajustes</SelectItem>
                        </SelectContent>
                    </Select>
                )}

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            id="date-picker-range"
                            variant={"outline"}
                            className={cn(
                                "w-full sm:w-[280px] justify-start text-left font-normal px-2.5",
                                !date && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (
                                date.to ? (
                                    <>
                                        {format(date.from, "LLL dd, y", { locale: es })} -{" "}
                                        {format(date.to, "LLL dd, y", { locale: es })}
                                    </>
                                ) : (
                                    <>Desde {format(date.from, "LLL dd, y", { locale: es })} (selecciona fin)</>
                                )
                            ) : (
                                <span>Filtrar por fecha</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={date?.from}
                            selected={date}
                            onSelect={handleDateChange}
                            numberOfMonths={2}
                            locale={es}
                        />
                    </PopoverContent>
                </Popover>

                {hasFilters && (
                    <Button variant="ghost" onClick={clearFilters} className="h-10 px-2 lg:px-3">
                        Limpiar
                        <X className="ml-2 h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}
