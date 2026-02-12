"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

type MovementHistoryTransition = {
    isPending: boolean
    startTransition: React.TransitionStartFunction
}

const MovementHistoryTransitionContext = React.createContext<MovementHistoryTransition | null>(null)

export function MovementHistoryProvider({ children }: { children: React.ReactNode }) {
    const [isPending, startTransition] = React.useTransition()

    return (
        <MovementHistoryTransitionContext.Provider value={{ isPending, startTransition }}>
            {children}
        </MovementHistoryTransitionContext.Provider>
    )
}

export function MovementHistoryLoadingOverlay({ children }: { children: React.ReactNode }) {
    const ctx = React.useContext(MovementHistoryTransitionContext)
    const isPending = !!ctx?.isPending

    return (
        <div className="relative">
            <div className={isPending ? "opacity-0" : undefined} aria-hidden={isPending ? "true" : undefined}>
                {children}
            </div>
            {isPending && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Actualizando...
                    </div>
                </div>
            )}
        </div>
    )
}

export function useMovementHistoryTransition() {
    return React.useContext(MovementHistoryTransitionContext)
}
