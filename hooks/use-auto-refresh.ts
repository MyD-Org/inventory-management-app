"use client"

// Refresco automático de los datos del server, para las pantallas que quedan
// abiertas sin que nadie las toque.
//
// El caso que lo justifica es el tablero colgado en el taller: sin esto, un
// pedido cargado desde otra PC no aparece nunca, porque los datos llegan como
// props de un Server Component y solo se vuelven a pedir al navegar o recargar.
//
// La ventana horaria NO es un capricho: Neon factura tiempo de compute
// encendido, no consultas. Si el poll corriera de noche y los fines de semana,
// la base nunca suspendería y pagaríamos 24/7 por una pantalla que nadie mira.
// Acotado al horario del taller, fuera de hora no sale un solo request y el
// compute suspende igual que antes.

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { withinWorkHours } from "@/lib/auto-refresh-window"

/** Cada cuánto se piden datos nuevos. Diez minutos alcanza para un tablero de
 *  taller: nadie mira una pantalla de pared esperando el segundo exacto, y cada
 *  consulta de menos es compute que no se paga. */
const POLL_MS = 10 * 60 * 1000

/** Piso entre dos refrescos seguidos. Sin esto, alguien que hace alt-tab cada
 *  cinco segundos dispara la consulta pesada del tablero cada cinco segundos. */
const MIN_GAP_MS = 30 * 1000

export function useAutoRefresh() {
    const router = useRouter()
    // Arranca en "ahora": la página se acaba de renderizar en el server, así que
    // los datos ya están frescos. Con 0, un foco apenas cargada la pantalla
    // disparaba una consulta al pedo.
    const lastRun = useRef(Date.now())
    // Refrescar en medio de un arrastre le saca la tarjeta de la mano al
    // operario. Se registra a nivel window porque el estado del drag vive
    // adentro del tablero y este hook no tiene por qué conocerlo.
    const dragging = useRef(false)

    useEffect(() => {
        function maybeRefresh() {
            if (dragging.current) return
            // Una pestaña de fondo no la está mirando nadie: refrescarla es
            // pagar compute para pintar algo invisible. Cuando vuelva al frente,
            // el listener de visibilitychange la pone al día.
            if (document.visibilityState !== "visible") return
            if (!withinWorkHours(new Date())) return
            const now = Date.now()
            if (now - lastRun.current < MIN_GAP_MS) return
            lastRun.current = now
            router.refresh()
        }

        // La pantalla siempre encendida nunca pierde el foco, así que este
        // intervalo es el único camino que la mantiene al día. Al estar en
        // primer plano el navegador no lo frena.
        const timer = setInterval(maybeRefresh, POLL_MS)

        // Para las PCs de los usuarios, en cambio, el caso de todos los días es
        // volver a la pestaña después de estar en otra cosa. Sale gratis y es
        // lo que además recupera la pantalla del taller si se durmió o se quedó
        // sin red: el intervalo pudo haberse frenado, esto la pone al día.
        function onVisible() {
            if (document.visibilityState === "visible") maybeRefresh()
        }
        function onDragStart() {
            dragging.current = true
        }
        function onDragEnd() {
            dragging.current = false
        }

        document.addEventListener("visibilitychange", onVisible)
        window.addEventListener("focus", maybeRefresh)
        window.addEventListener("dragstart", onDragStart)
        window.addEventListener("dragend", onDragEnd)

        return () => {
            clearInterval(timer)
            document.removeEventListener("visibilitychange", onVisible)
            window.removeEventListener("focus", maybeRefresh)
            window.removeEventListener("dragstart", onDragStart)
            window.removeEventListener("dragend", onDragEnd)
        }
    }, [router])
}
