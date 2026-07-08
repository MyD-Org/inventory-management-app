"use client"

// Input numérico con edición natural:
// - Mantiene un estado STRING mientras se edita: se puede borrar todo el valor sin
//   que salte a 0; el número se comitea en cada tecleo válido y al perder foco.
// - Sanitiza al tipear: solo dígitos y un punto decimal (sin letras ni comas).
//   La variante `integer` bloquea también el punto.
// - `withSteppers` agrega botones +/− que mueven la cantidad de a 1 ENTERO
//   (tipear decimales a mano, ej. 1.5, sigue permitido salvo `integer`).

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Minus, Plus } from "lucide-react"

const DECIMAL_RE = /^\d*\.?\d*$/
const INTEGER_RE = /^\d*$/

export function NumericInput({
    value,
    onChange,
    integer = false,
    withSteppers = false,
    min = 0,
    className,
    id,
    placeholder,
    disabled,
}: {
    value: number
    onChange: (n: number) => void
    integer?: boolean
    withSteppers?: boolean
    min?: number
    className?: string
    id?: string
    placeholder?: string
    disabled?: boolean
}) {
    const [text, setText] = useState<string>(String(value))
    const focused = useRef(false)

    // Sincronizar cambios externos (ej. "actualizar precios") solo cuando NO se está editando.
    useEffect(() => {
        if (!focused.current) setText(String(value))
    }, [value])

    const commit = (raw: string) => {
        const n = Number.parseFloat(raw)
        onChange(Number.isFinite(n) ? Math.max(min, n) : min)
    }

    const handleChange = (raw: string) => {
        const re = integer ? INTEGER_RE : DECIMAL_RE
        if (!re.test(raw)) return // letra, coma o segundo punto: se ignora el tecleo
        setText(raw)
        commit(raw)
    }

    const handleBlur = () => {
        focused.current = false
        const n = Number.parseFloat(text)
        const clean = Number.isFinite(n) ? Math.max(min, n) : min
        setText(String(clean))
        onChange(clean)
    }

    const step = (delta: 1 | -1) => {
        // Steppers: siempre en enteros (1, 2, 3…), partiendo del entero redondeado.
        const next = Math.max(min, Math.round(value) + delta)
        setText(String(next))
        onChange(next)
    }

    const input = (
        <Input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            onFocus={() => { focused.current = true }}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            className={withSteppers ? "text-center" : className}
        />
    )

    if (!withSteppers) return input

    return (
        <div className={`flex items-center gap-1 ${className ?? ""}`}>
            <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-8" disabled={disabled} onClick={() => step(-1)} aria-label="Restar 1">
                <Minus className="w-3.5 h-3.5" />
            </Button>
            {input}
            <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-8" disabled={disabled} onClick={() => step(1)} aria-label="Sumar 1">
                <Plus className="w-3.5 h-3.5" />
            </Button>
        </div>
    )
}
