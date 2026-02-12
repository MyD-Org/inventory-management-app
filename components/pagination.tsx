import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type PageItem = number | "ellipsis"

interface PaginationProps {
    currentPage: number
    totalPages: number
    buildHref: (page: number) => string
    className?: string
}

function getPageItems(currentPage: number, totalPages: number): PageItem[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const items: PageItem[] = [1]
    let left = Math.max(2, currentPage - 1)
    let right = Math.min(totalPages - 1, currentPage + 1)

    if (currentPage <= 3) {
        left = 2
        right = 4
    } else if (currentPage >= totalPages - 2) {
        left = totalPages - 3
        right = totalPages - 1
    }

    if (left > 2) items.push("ellipsis")
    for (let page = left; page <= right; page += 1) {
        items.push(page)
    }
    if (right < totalPages - 1) items.push("ellipsis")
    items.push(totalPages)

    return items
}

export function Pagination({ currentPage, totalPages, buildHref, className }: PaginationProps) {
    if (totalPages <= 1) return null

    const pages = getPageItems(currentPage, totalPages)

    return (
        <nav className={cn("flex items-center gap-2", className)} aria-label="Paginacion">
            {currentPage > 1 ? (
                <Link
                    href={buildHref(currentPage - 1)}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    prefetch
                    scroll={false}
                >
                    Anterior
                </Link>
            ) : (
                <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
                    Anterior
                </span>
            )}

            {pages.map((page, index) => {
                if (page === "ellipsis") {
                    return (
                        <span key={`ellipsis-${index}`} className="px-2 text-sm text-muted-foreground">
                            ...
                        </span>
                    )
                }

                const isActive = page === currentPage
                return (
                    <Link
                        key={page}
                        href={buildHref(page)}
                        className={buttonVariants({ variant: isActive ? "default" : "outline", size: "sm" })}
                        prefetch
                        scroll={false}
                        aria-current={isActive ? "page" : undefined}
                    >
                        {page}
                    </Link>
                )
            })}

            {currentPage < totalPages ? (
                <Link
                    href={buildHref(currentPage + 1)}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    prefetch
                    scroll={false}
                >
                    Siguiente
                </Link>
            ) : (
                <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
                    Siguiente
                </span>
            )}
        </nav>
    )
}
