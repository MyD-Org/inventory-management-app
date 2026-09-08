"use client"

import { useEffect } from "react"

// Registra el service worker de /sw.js, que es el requisito que le falta a
// Chrome en Android para ofrecer "Instalar app". En iOS no hace falta (se
// instala desde Compartir → Agregar a inicio) pero tampoco molesta.
export function RegisterSW() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return
        // Después del load: registrarlo durante el arranque compite por ancho de
        // banda con lo que la persona vino a ver.
        const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {})
        if (document.readyState === "complete") register()
        else {
            window.addEventListener("load", register)
            return () => window.removeEventListener("load", register)
        }
    }, [])

    return null
}
