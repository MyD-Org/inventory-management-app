import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SearchX } from "lucide-react"

// La pantalla de "no está", compartida por los distintos not-found de la app.
//
// EL MISMO CARTEL EN TRES LUGARES a propósito: da igual si lo que no aparece es
// un pedido, una ficha o una dirección inventada. Lo que cambia es qué se nombra
// y a dónde se vuelve, y eso son dos props.
export function NotFoundScreen({
    title,
    description,
    actionLabel,
    actionHref,
}: {
    title: string
    description: string
    actionLabel: string
    actionHref: string
}) {
    return (
        <div className="mx-auto w-full max-w-md px-8 py-20 text-center">
            <SearchX className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 font-display text-2xl font-bold">{title}</h1>
            <p className="mt-2 text-base text-muted-foreground">{description}</p>
            <div className="mt-6">
                <Button asChild>
                    <Link href={actionHref}>{actionLabel}</Link>
                </Button>
            </div>
        </div>
    )
}
