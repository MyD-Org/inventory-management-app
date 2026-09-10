"use client"

import { useEffect, useRef, useState } from "react"
import { UserRound } from "lucide-react"
import { Label } from "@/components/ui/label"

export interface OperarioElegido {
    id: number
    name: string
}

// Cuánto se recuerda al operario elegido. Una hora es el punto medio entre las
// dos formas de fallar: con muy poco, cada movimiento arranca preguntando quién
// sos y la gente aprende a tocar el primer botón sin leer; con mucho, el turno
// siguiente hereda el nombre del anterior y el histórico miente. Se guarda en
// localStorage y no en cookie porque es de ESTA tablet, no de la sesión: dos
// dispositivos con el mismo login tienen operarios distintos al mismo tiempo.
const RECUERDO_MS = 60 * 60 * 1000
const CLAVE = "operario_actual"

function leerRecordado(): OperarioElegido | null {
    try {
        const crudo = localStorage.getItem(CLAVE)
        if (!crudo) return null
        const { id, name, ts } = JSON.parse(crudo)
        if (typeof id !== "number" || typeof name !== "string" || typeof ts !== "number") return null
        if (Date.now() - ts > RECUERDO_MS) return null
        return { id, name }
    } catch {
        // Modo privado, storage lleno o un JSON viejo con otra forma: sin
        // recuerdo se pregunta de nuevo, que es el peor caso aceptable.
        return null
    }
}

export function recordarOperario(op: OperarioElegido | null) {
    try {
        if (!op) localStorage.removeItem(CLAVE)
        else localStorage.setItem(CLAVE, JSON.stringify({ ...op, ts: Date.now() }))
    } catch {
        /* sin recuerdo, se vuelve a preguntar */
    }
}

interface Props {
    value: OperarioElegido | null
    onChange: (op: OperarioElegido | null) => void
    /** Si a esta sesión hay que pedirle el operario. Lo decide el servidor (no
     *  hay operarios cargados, o el que mira es admin y su cuenta ya lleva su
     *  nombre) y el formulario lo necesita para saber si puede confirmar sin
     *  elegir a nadie. */
    onRequirement?: (requerido: boolean) => void
    error?: boolean
    disabled?: boolean
}

/**
 * Quién está moviendo el material, en la terminal compartida del depósito.
 *
 * La sesión no sirve para esto: hay un solo login abierto todo el día y nadie lo
 * va a cambiar para retirar tres tornillos. Así que el movimiento se firma con
 * un toque acá, y la sesión queda como lo que es — el permiso, no la persona.
 */
export function OperatorPicker({ value, onChange, onRequirement, error, disabled }: Props) {
    const [operarios, setOperarios] = useState<OperarioElegido[] | null>(null)
    // Null mientras no contestó el servidor: hasta saberlo no se dibuja nada,
    // así la pantalla del admin no parpadea con un selector que no le toca.
    const [requerido, setRequerido] = useState<boolean | null>(null)
    const [fallo, setFallo] = useState(false)

    // onChange/onRequirement se redefinen en cada render del padre. Si entraran
    // como dependencias del efecto, pedir la lista provocaría un render que
    // volvería a pedirla: por ref, el efecto corre una sola vez al montar.
    const onChangeRef = useRef(onChange)
    const onRequirementRef = useRef(onRequirement)
    useEffect(() => {
        onChangeRef.current = onChange
        onRequirementRef.current = onRequirement
    })

    useEffect(() => {
        let vivo = true
            ; (async () => {
                try {
                    const res = await fetch("/api/operarios")
                    if (!res.ok) throw new Error("no se pudo")
                    const data = await res.json()
                    if (!vivo) return
                    const lista: OperarioElegido[] = (data.operators ?? []).map((o: any) => ({
                        id: o.id,
                        name: o.name,
                    }))
                    setOperarios(lista)
                    setRequerido(Boolean(data.required))
                    onRequirementRef.current?.(Boolean(data.required))

                    // El recordado se revalida contra la lista: si lo desactivaron
                    // o le cambiaron el nombre, gana lo que dice el servidor.
                    const recordado = leerRecordado()
                    const vigente = recordado && lista.find((o) => o.id === recordado.id)
                    if (vigente) onChangeRef.current(vigente)
                    else if (recordado) recordarOperario(null)
                } catch {
                    if (vivo) setFallo(true)
                }
            })()
        return () => {
            vivo = false
        }
    }, [])

    const elegir = (op: OperarioElegido) => {
        const nuevo = value?.id === op.id ? null : op
        onChange(nuevo)
        recordarOperario(nuevo)
    }

    // Si la lista no llegó, el selector se queda a la vista con el aviso: sin él
    // el formulario dejaría confirmar y el rechazo llegaría del servidor, que es
    // el peor lugar para enterarse.
    if (fallo) {
        return (
            <div className="space-y-2">
                <Label className="flex items-center gap-2 font-semibold">
                    <UserRound className="h-4 w-4" />
                    ¿Quién lo hace? *
                </Label>
                <p className="text-sm text-muted-foreground">
                    No se pudo cargar la lista de operarios.
                </p>
            </div>
        )
    }

    // El admin firma con su propia cuenta y no se le pregunta nada; tampoco hay
    // nada que preguntar si no hay operarios cargados. Y mientras el servidor no
    // contesta no se dibuja: mostrar y esconder es peor que tardar un instante.
    if (requerido !== true || operarios === null) return null

    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-2 font-semibold">
                <UserRound className="h-4 w-4" />
                ¿Quién lo hace? *
            </Label>

            <div
                className={`flex flex-wrap gap-2 rounded-lg border p-2 ${error ? "border-destructive bg-destructive/5" : "border-dashed"
                    }`}
            >
                {operarios.map((op) => {
                    const elegido = value?.id === op.id
                    return (
                        <button
                            key={op.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => elegir(op)}
                            aria-pressed={elegido}
                            // Alto de 10 y no el del botón chico del sistema: se
                            // toca con el dedo, apurado y a veces con guantes.
                            className={`h-10 rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-50 ${elegido
                                ? "border-foreground bg-foreground text-background"
                                : "bg-background hover:bg-accent"
                                }`}
                        >
                            {op.name}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
