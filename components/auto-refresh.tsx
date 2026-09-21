"use client"

import { useAutoRefresh } from "@/hooks/use-auto-refresh"

// Para las pantallas que se arman enteras en el server y quedan abiertas en la
// tablet del taller: no tienen un client component propio donde colgar el hook.
export function AutoRefresh() {
    useAutoRefresh()
    return null
}
