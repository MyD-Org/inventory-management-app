"use client"

// Historia del pedido: los cambios y las notas en un solo hilo, ordenados por
// hora y agrupados por día. Los cambios son una línea gris; las notas, un
// recuadro con el nombre de quien la dejó — lo que alguien escribió a mano pesa
// más que un cambio de campo.

import { useEffect, useRef, useState } from "react"
import { Camera, ChevronRight, ImagePlus, Loader2, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { NotePhotoGallery } from "@/components/note-photo-gallery"
import { Textarea } from "@/components/ui/textarea"
import { addOrderNote, deleteOrderNote } from "@/lib/order-actions"
import { subirFotos } from "@/lib/note-photos"
import { eventIsVisible } from "@/lib/order-notes"
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
    reference: "la referencia",
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
                // El pedido se cargó cuando el producto no tenía hoja de costo y al
                // abrirlo se encontró: no es "un dato" cualquiera, es que la línea
                // pasó a tener materiales.
                if (e.field === "materiales") {
                    return <>cargó la lista de materiales de <Val>{nuevo}</Val></>
                }
                // La lista YA estaba y cambió porque se editó la ficha del
                // producto. Se dice el motivo: si el taller ya anotó los
                // materiales de este pedido en un papel, ese papel quedó viejo.
                // La lista se puso al día sola al abrir el pedido. No dice por qué:
                // pudo ser la ficha, la familia o una spec corregida, y a esta
                // altura no se sabe cuál. Si fue una spec, el cambio está acá al
                // lado en el mismo historial.
                if (e.field === "materiales_al_dia") {
                    return (
                        <>
                            puso al día la lista de materiales de <Val>{nuevo}</Val>
                        </>
                    )
                }
                if (e.field === "materiales_ficha") {
                    return (
                        <>
                            actualizó la lista de materiales de <Val>{nuevo}</Val> porque cambió su ficha
                        </>
                    )
                }
                return viejo && nuevo && viejo !== nuevo ? (
                    <>
                        cambió <Val tachado>{viejo}</Val> <span aria-hidden>→</span> <Val>{nuevo}</Val>
                        {/* En un cambio de opciones el antes y el después son los valores,
                            así que el producto va acá para saber de qué línea habla. */}
                        {e.body && <> en <Val>{e.body}</Val></>}
                    </>
                ) : (
                    <>cambió {campo} de <Val>{nuevo}</Val></>
                )
            case "materials_consumed":
                return (
                    <>
                        descontó <Val>{nuevo} {Number(nuevo) === 1 ? "material" : "materiales"}</Val> del inventario
                    </>
                )
            case "materials_returned":
                return (
                    <>
                        devolvió <Val>{nuevo} {Number(nuevo) === 1 ? "material" : "materiales"}</Val> al inventario
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

function Nota({ e, puedeBorrar, onBorrar }: { e: OrderEvent; puedeBorrar: boolean; onBorrar: () => void }) {
    const anonimo = e.actor_name === SIN_AUTOR
    return (
        <div className="group relative my-2 rounded-lg border bg-muted/40 px-3.5 py-3">
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
                {/* El tacho aparece al pasar por encima en escritorio; en el
                    teléfono no hay hover, así que ahí queda siempre visible. */}
                {puedeBorrar && (
                    <button
                        type="button"
                        onClick={onBorrar}
                        aria-label="Borrar nota"
                        title="Borrar nota"
                        className="-my-1 -mr-1.5 shrink-0 rounded p-1 text-muted-foreground outline-none transition-opacity hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            {/* El texto solo si hay: una nota puede ser nada más que una foto. */}
            {e.body && <p className="mt-2 whitespace-pre-wrap text-sm">{e.body}</p>}
            <NotePhotoGallery photos={e.photos} />
        </div>
    )
}

export function OrderActivity({
    orderId,
    events,
    currentEmail = null,
    isAdmin = false,
}: {
    orderId: number
    events: OrderEvent[]
    /** Para saber cuáles notas son propias: solo esas se pueden borrar. */
    currentEmail?: string | null
    isAdmin?: boolean
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [texto, setTexto] = useState("")
    const [guardando, setGuardando] = useState(false)
    // La nota que se está por borrar, esperando confirmación.
    const [aBorrar, setABorrar] = useState<OrderEvent | null>(null)
    const [borrando, setBorrando] = useState(false)
    // Las fotos elegidas, todavía en el navegador: no se suben al elegirlas sino
    // al apretar "Dejar nota", así arrepentirse no deja archivos huérfanos en el
    // Blob. `preview` es un blob: local que hay que revocar al sacar la foto.
    const [fotos, setFotos] = useState<{ id: string; file: File; preview: string }[]>([])
    const [subiendo, setSubiendo] = useState<{ hechas: number; total: number } | null>(null)
    const galeriaRef = useRef<HTMLInputElement>(null)
    const camaraRef = useRef<HTMLInputElement>(null)

    // Si alguien se va del pedido con fotos elegidas y sin dejar la nota, los
    // blob: locales quedarían tomando memoria hasta recargar la página.
    const fotosRef = useRef(fotos)
    fotosRef.current = fotos
    useEffect(() => {
        return () => {
            for (const f of fotosRef.current) URL.revokeObjectURL(f.preview)
        }
    }, [])
    // Abierta y en "Notas" desde el arranque: lo que se viene a leer del
    // pedido son los mensajes que alguien dejó a mano, no el registro de campos
    // cambiados. Los cambios siguen a un clic, en "Historial".
    const [soloNotas, setSoloNotas] = useState(true)
    const [abierto, setAbierto] = useState(true)

    // La regla de qué se dibuja vive en lib/order-notes: la misma la usa la
    // versión impresa, y cuando estaba duplicada se desincronizaron.
    const conContenido = events.filter(eventIsVisible)
    const visibles = soloNotas ? conContenido.filter((e) => e.kind === "note") : conContenido

    // Agrupado por día, conservando el orden que trajo la consulta.
    const dias: { dia: string; eventos: OrderEvent[] }[] = []
    for (const e of visibles) {
        const dia = fecha(e.created_at)
        const ultimo = dias[dias.length - 1]
        if (ultimo?.dia === dia) ultimo.eventos.push(e)
        else dias.push({ dia, eventos: [e] })
    }

    // Cuántas fotos entran. Mismo número que valida addOrderNote: acá es para
    // no dejar elegir la novena, allá para que no entre por otra puerta.
    const MAX_FOTOS = 8

    function agregarFotos(lista: FileList | null) {
        if (!lista || lista.length === 0) return
        const nuevas = Array.from(lista)
            .filter((f) => f.type.startsWith("image/"))
            .slice(0, MAX_FOTOS - fotos.length)
        if (nuevas.length === 0) {
            toast.error(`No entran más de ${MAX_FOTOS} fotos en una nota`)
            return
        }
        setFotos((prev) => [
            ...prev,
            ...nuevas.map((file) => ({
                id: `${file.name}-${file.lastModified}-${Math.random()}`,
                file,
                preview: URL.createObjectURL(file),
            })),
        ])
    }

    function sacarFoto(id: string) {
        setFotos((prev) => {
            const va = prev.find((f) => f.id === id)
            if (va) URL.revokeObjectURL(va.preview)
            return prev.filter((f) => f.id !== id)
        })
    }

    async function dejarNota() {
        const cuerpo = texto.trim()
        // Una foto sola alcanza: "así llegó la pieza" no necesita texto.
        if (!cuerpo && fotos.length === 0) return
        setGuardando(true)

        let subidas: Awaited<ReturnType<typeof subirFotos>> = []
        if (fotos.length > 0) {
            setSubiendo({ hechas: 0, total: fotos.length })
            try {
                subidas = await subirFotos(
                    fotos.map((f) => f.file),
                    (hechas, total) => setSubiendo({ hechas, total }),
                )
            } catch (error) {
                setSubiendo(null)
                setGuardando(false)
                // La nota NO se guarda si las fotos no subieron: guardarla sin
                // ellas dejaría la mitad del mensaje y nadie se enteraría.
                toast.error("No se pudieron subir las fotos", {
                    description: error instanceof Error ? error.message : "Probá de nuevo",
                })
                return
            }
            setSubiendo(null)
        }

        const result = await addOrderNote(orderId, cuerpo, subidas)
        setGuardando(false)
        if (result.error) {
            toast.error("No se pudo guardar la nota", { description: result.error })
            return
        }
        setTexto("")
        for (const f of fotos) URL.revokeObjectURL(f.preview)
        setFotos([])
        router.refresh()
    }

    // La misma regla que el servidor: la propia, o cualquiera si sos admin. Acá
    // solo decide si se dibuja el botón — quien manda es la server action.
    function puedeBorrar(e: OrderEvent): boolean {
        return isAdmin || (Boolean(currentEmail) && e.actor_email === currentEmail)
    }

    async function borrarNota() {
        if (!aBorrar) return
        setBorrando(true)
        const result = await deleteOrderNote(orderId, aBorrar.id)
        setBorrando(false)
        if (result.error) {
            toast.error("No se pudo borrar la nota", { description: result.error })
            return
        }
        setABorrar(null)
        router.refresh()
    }

    return (
        <section className="no-print">
            <div className="flex items-center gap-3 border-t pt-5">
                {/* Mismo desplegable que los materiales, pero abierto: la historia
                    del pedido se lee siempre, no solo cuando algo no cuadra. */}
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
                        { k: true, label: "Notas" },
                        { k: false, label: "Historial" },
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
                            e.kind === "note" ? (
                                <Nota
                                    key={e.id}
                                    e={e}
                                    puedeBorrar={puedeBorrar(e)}
                                    onBorrar={() => setABorrar(e)}
                                />
                            ) : (
                                <Cambio key={e.id} e={e} />
                            ),
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
                {/* Las fotos elegidas, antes de subir. */}
                {fotos.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-t px-3 py-2.5">
                        {fotos.map((f) => (
                            <div key={f.id} className="relative">
                                <img
                                    src={f.preview}
                                    alt=""
                                    className="h-16 w-16 rounded-md border object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => sacarFoto(f.id)}
                                    disabled={guardando}
                                    aria-label={`Sacar ${f.file.name}`}
                                    className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-1 border-t bg-muted/40 px-3 py-2">
                    {/* Dos entradas y no una: el `capture` del segundo abre la
                        cámara derecho, sin pasar por el selector de archivos.
                        En escritorio no sirve, así que ese botón es solo mobile. */}
                    <input
                        ref={galeriaRef}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={(e) => {
                            agregarFotos(e.target.files)
                            // Se limpia para que elegir la MISMA foto dos veces
                            // seguidas vuelva a disparar el onChange.
                            e.target.value = ""
                        }}
                    />
                    <input
                        ref={camaraRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        onChange={(e) => {
                            agregarFotos(e.target.files)
                            e.target.value = ""
                        }}
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => camaraRef.current?.click()}
                        disabled={guardando || fotos.length >= MAX_FOTOS}
                        className="gap-1.5 sm:hidden"
                    >
                        <Camera className="h-4 w-4" />
                        Cámara
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => galeriaRef.current?.click()}
                        disabled={guardando || fotos.length >= MAX_FOTOS}
                        className="gap-1.5"
                    >
                        <ImagePlus className="h-4 w-4" />
                        Foto
                    </Button>

                    {subiendo && (
                        <span className="ml-1 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Subiendo {Math.min(subiendo.hechas + 1, subiendo.total)} de {subiendo.total}
                        </span>
                    )}

                    <Button
                        size="sm"
                        className="ml-auto"
                        onClick={dejarNota}
                        disabled={guardando || (!texto.trim() && fotos.length === 0)}
                    >
                        {guardando ? "Guardando…" : "Dejar nota"}
                    </Button>
                </div>
            </div>
            )}

            <ConfirmDialog
                open={aBorrar !== null}
                onOpenChange={(open) => !open && setABorrar(null)}
                title="¿Borrar esta nota?"
                description="La nota desaparece del pedido y no se puede recuperar."
                confirmLabel={borrando ? "Borrando…" : "Borrar"}
                destructive
                loading={borrando}
                onConfirm={borrarNota}
            />
        </section>
    )
}
