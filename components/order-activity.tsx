"use client"

// Historia del pedido: los cambios y las notas en un solo hilo, ordenados por
// hora y agrupados por día. Los cambios son una línea gris; las notas, un
// recuadro con el nombre de quien la dejó — lo que alguien escribió a mano pesa
// más que un cambio de campo.

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { addOrderNote } from "@/lib/order-actions"
import { useToast } from "@/hooks/use-toast"
import { STATUS_LABELS, type OrderStatus } from "@/lib/order-statuses"
import type { OrderEvent } from "@/lib/order-events"

const PRIORIDADES: Record<string, string> = { baja: "Baja", normal: "Normal", alta: "Alta" }

// De dónde entró el pedido. "manual" es el valor que guarda el alta de la app
// (lo manda new-order-page), así que en pantalla se dice "la web": para quien
// lee la historia, manual contra automático no significa nada.
const ORIGENES: Record<string, string> = {
    manual: "la web",
    whatsapp: "WhatsApp",
    crm: "el CRM",
    api: "la API",
}

// Los pedidos y las notas anteriores a la historia no tienen autor: nadie lo
// guardaba. Cuando el actor es este, la frase se dice en impersonal en vez de
// firmar con un nombre que no existe.
const SIN_AUTOR = "Desconocido"

const CAMPOS: Record<string, string> = {
    customer_name: "el cliente",
    customer_external_id: "la ficha del cliente",
    customer_phone: "el teléfono",
    priority: "la prioridad",
    delivery_date_estimate: "la entrega",
    notes: "las notas",
    invoice_terms: "las condiciones de la factura",
    invoice_notes: "la nota de la factura",
    quantity: "la cantidad",
    specs: "las opciones",
}

// La zona va FIJA y no la del entorno: este componente se pinta primero en el
// server (UTC) y después en el navegador (Argentina).
//
// Y las partes se arman a mano en vez de usar toLocaleTimeString: el formato
// "07:50 p. m." de es-AR mete un espacio angosto (U+202F) que Node y el
// navegador escriben distinto. Los dos textos se ven iguales en pantalla y
// React igual los daba por diferentes, así que tiraba el error de hidratación.
const ZONA = "America/Argentina/Buenos_Aires"

const HORA = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
})
const DIA = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "2-digit", month: "short" })
const FECHA_CORTA = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA })

function parte(f: Intl.DateTimeFormat, d: Date, tipo: Intl.DateTimeFormatPartTypes): string {
    return f.formatToParts(d).find((p) => p.type === tipo)?.value ?? ""
}

function hora(iso: string): string {
    const d = new Date(iso)
    return `${parte(HORA, d, "hour")}:${parte(HORA, d, "minute")}`
}

function fecha(iso: string): string {
    const d = new Date(iso)
    const hoy = new Date()
    const ayer = new Date()
    ayer.setDate(ayer.getDate() - 1)
    const dia = (x: Date) => FECHA_CORTA.format(x)
    if (dia(d) === dia(hoy)) return "Hoy"
    if (dia(d) === dia(ayer)) return "Ayer"
    return `${parte(DIA, d, "day")} ${parte(DIA, d, "month").replace(".", "")}`
}

// Las iniciales del nombre. "Bot de WhatsApp" da "BW", que no dice nada, pero el
// nombre completo va al lado: el avatar es para distinguir de un vistazo quién
// habla, no para leerlo.
function iniciales(nombre: string): string {
    return nombre
        .split(/\s+/)
        .filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(p))
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2) || "?"
}

/** El valor como se muestra: los estados y las prioridades tienen etiqueta propia. */
function valor(e: OrderEvent, v: string | null): string | null {
    if (!v) return null
    if (e.kind === "status" || e.field === "status") return STATUS_LABELS[v as OrderStatus] ?? v
    if (e.field === "priority") return PRIORIDADES[v] ?? v
    if (e.field === "delivery_date_estimate") {
        const [y, m, d] = v.split("-").map(Number)
        if (y && m && d) {
            return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
        }
    }
    return v
}

function Val({ children, tachado }: { children: React.ReactNode; tachado?: boolean }) {
    return (
        <span
            className={`font-mono text-xs rounded border px-1.5 py-0.5 ${
                tachado ? "text-muted-foreground line-through" : "text-foreground"
            }`}
        >
            {children}
        </span>
    )
}

function Cambio({ e }: { e: OrderEvent }) {
    const viejo = valor(e, e.old_value)
    const nuevo = valor(e, e.new_value)
    const campo = (e.field && CAMPOS[e.field]) ?? "un dato"
    const anonimo = e.actor_name === SIN_AUTOR

    const frase = (() => {
        switch (e.kind) {
            case "created": {
                // Si el que creó el pedido ES el bot, decir "desde WhatsApp" al
                // lado repite el mismo dato dos veces.
                const origen = ORIGENES[nuevo ?? ""] ?? nuevo
                const repetido = e.actor_name === "Bot de WhatsApp" && nuevo === "whatsapp"
                return (
                    <>
                        {anonimo ? "Pedido creado" : "creó el pedido"}
                        {origen && !repetido && <> desde <Val>{origen}</Val></>}
                    </>
                )
            }
            case "status":
                return <>pasó el pedido a <Val>{nuevo}</Val></>
            case "item_added":
                return <>agregó <Val>{nuevo}</Val></>
            case "item_removed":
                return <>quitó <Val>{viejo}</Val></>
            case "item_updated":
                return viejo && nuevo && viejo !== nuevo ? (
                    <>cambió <Val tachado>{viejo}</Val> <span aria-hidden>→</span> <Val>{nuevo}</Val></>
                ) : (
                    <>cambió {campo} de <Val>{nuevo}</Val></>
                )
            case "materials_consumed":
                return (
                    <>
                        descontó <Val>{nuevo} {Number(nuevo) === 1 ? "material" : "materiales"}</Val> del inventario
                    </>
                )
            case "invoice":
                return <>emitió la factura <Val>{nuevo}</Val></>
            default:
                // Un campo que se vacía no tiene "nuevo": se dice que lo borró.
                if (viejo && nuevo) {
                    return (
                        <>
                            cambió {campo} de <Val tachado>{viejo}</Val> <span aria-hidden>→</span> <Val>{nuevo}</Val>
                        </>
                    )
                }
                if (nuevo) return <>puso {campo} en <Val>{nuevo}</Val></>
                return <>borró {campo}</>
        }
    })()

    const color =
        e.kind === "status"
            ? "border-sky-500"
            : e.kind === "item_added"
              ? "border-emerald-500"
              : e.kind === "item_removed"
                ? "border-destructive"
                : e.kind === "invoice"
                  ? "border-violet-500"
                  : "border-muted-foreground/40"

    return (
        <div className="relative flex items-baseline gap-2 py-1.5 text-sm text-muted-foreground">
            <span className={`absolute -left-[22px] top-2.5 h-2.5 w-2.5 rounded-full border-2 bg-background ${color}`} />
            <span className="min-w-0">
                {!anonimo && <span className="font-medium text-foreground">{e.actor_name}</span>}{" "}
                {frase}
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground/80">
                {hora(e.created_at)}
            </span>
        </div>
    )
}

function Nota({ e }: { e: OrderEvent }) {
    const anonimo = e.actor_name === SIN_AUTOR
    return (
        <div className="relative my-2 rounded-lg border bg-muted/40 px-3.5 py-3">
            <span className="absolute -left-[22px] top-4 h-2.5 w-2.5 rounded-full border-2 border-foreground bg-foreground" />
            <div className="flex items-center gap-2.5">
                {!anonimo && (
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground font-display text-[0.65rem] font-bold text-background">
                        {iniciales(e.actor_name)}
                    </span>
                )}
                <span
                    className={
                        anonimo
                            ? "text-sm text-muted-foreground"
                            : "font-display text-sm font-semibold"
                    }
                >
                    {anonimo ? "Nota anterior, sin autor registrado" : e.actor_name}
                </span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{hora(e.created_at)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{e.body}</p>
        </div>
    )
}

export function OrderActivity({ orderId, events }: { orderId: number; events: OrderEvent[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [texto, setTexto] = useState("")
    const [guardando, setGuardando] = useState(false)
    const [soloNotas, setSoloNotas] = useState(false)
    const [abierto, setAbierto] = useState(false)

    // Una nota sin texto no se dibuja. Pasó con las notas viejas migradas: el
    // recuadro vacío ocupaba media pantalla para no decir nada.
    const conContenido = events.filter((e) => e.kind !== "note" || Boolean(e.body?.trim()))
    const visibles = soloNotas ? conContenido.filter((e) => e.kind === "note") : conContenido

    // Agrupado por día, conservando el orden que trajo la consulta.
    const dias: { dia: string; eventos: OrderEvent[] }[] = []
    for (const e of visibles) {
        const dia = fecha(e.created_at)
        const ultimo = dias[dias.length - 1]
        if (ultimo?.dia === dia) ultimo.eventos.push(e)
        else dias.push({ dia, eventos: [e] })
    }

    async function dejarNota() {
        const cuerpo = texto.trim()
        if (!cuerpo) return
        setGuardando(true)
        const result = await addOrderNote(orderId, cuerpo)
        setGuardando(false)
        if (result.error) {
            toast.error("No se pudo guardar la nota", { description: result.error })
            return
        }
        setTexto("")
        router.refresh()
    }

    return (
        <section className="no-print">
            <div className="flex items-center gap-3 border-t pt-5">
                {/* Mismo desplegable que los materiales, y cerrado igual que ellos:
                    la historia se consulta cuando algo no cuadra, no siempre. */}
                <button
                    type="button"
                    onClick={() => setAbierto((v) => !v)}
                    aria-expanded={abierto}
                    className="flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                    <ChevronRight
                        className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${abierto ? "rotate-90" : ""}`}
                    />
                    <span className="font-display text-base font-semibold">Actividad</span>
                    <span className="font-mono text-xs text-muted-foreground/80">
                        ({conContenido.length})
                    </span>
                </button>
                {abierto && (
                <div className="ml-auto inline-flex rounded-lg border bg-muted/60 p-0.5">
                    {[
                        { k: false, label: "Todo" },
                        { k: true, label: "Solo notas" },
                    ].map(({ k, label }) => (
                        <button
                            key={label}
                            type="button"
                            aria-pressed={soloNotas === k}
                            onClick={() => setSoloNotas(k)}
                            className={`rounded-md px-2.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                soloNotas === k
                                    ? "bg-background font-medium text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                )}
            </div>

            {abierto && dias.length === 0 && (
                <p className="py-6 text-sm text-muted-foreground">
                    {soloNotas ? "Todavía no hay notas en este pedido." : "Todavía no hay actividad."}
                </p>
            )}

            {abierto && dias.map(({ dia, eventos }) => (
                <div key={dia}>
                    <p className="mb-2 mt-5 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                        {dia}
                    </p>
                    {/* La línea vertical cose los eventos del día. */}
                    <div className="relative pl-6 before:absolute before:bottom-1.5 before:left-2 before:top-1.5 before:w-px before:bg-border">
                        {eventos.map((e) =>
                            e.kind === "note" ? <Nota key={e.id} e={e} /> : <Cambio key={e.id} e={e} />,
                        )}
                    </div>
                </div>
            ))}

            {abierto && (
            <div className="mt-5 overflow-hidden rounded-lg border">
                <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Dejar nota"
                    aria-label="Nueva nota"
                    className="min-h-16 resize-none border-0 bg-transparent px-3.5 py-3 text-sm focus-visible:ring-0 dark:bg-transparent"
                />
                <div className="flex items-center border-t bg-muted/40 px-3 py-2">
                    <Button
                        size="sm"
                        className="ml-auto"
                        onClick={dejarNota}
                        disabled={guardando || !texto.trim()}
                    >
                        {guardando ? "Guardando…" : "Dejar nota"}
                    </Button>
                </div>
            </div>
            )}
        </section>
    )
}
