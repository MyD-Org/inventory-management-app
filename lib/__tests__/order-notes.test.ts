import { describe, expect, it } from "vitest"
import { eventIsVisible, noteHasContent } from "@/lib/order-notes"
import type { OrderEvent, OrderEventPhoto } from "@/lib/order-events"

const foto: OrderEventPhoto = {
    id: 1,
    url: "https://x.public.blob.vercel-storage.com/a.jpg",
    pathname: "a.jpg",
    width: null,
    height: null,
}

function nota(body: string | null, photos: OrderEventPhoto[] = []): OrderEvent {
    return {
        id: 1,
        actor_name: "Dalila",
        actor_email: null,
        kind: "note",
        field: null,
        old_value: null,
        new_value: null,
        body,
        created_at: "2026-09-09T23:41:28Z",
        photos,
    }
}

describe("noteHasContent", () => {
    it("una nota con texto tiene contenido", () => {
        expect(noteHasContent(nota("revisar la factura"))).toBe(true)
    })

    // El caso que rompió: la nota se guardaba pero no se dibujaba en ninguna parte.
    it("una nota que es SOLO una foto tiene contenido", () => {
        expect(noteHasContent(nota("", [foto]))).toBe(true)
        expect(noteHasContent(nota(null, [foto]))).toBe(true)
    })

    it("una nota sin texto ni fotos no tiene contenido", () => {
        expect(noteHasContent(nota(""))).toBe(false)
        expect(noteHasContent(nota(null))).toBe(false)
        // Las notas viejas migradas traen espacios en blanco, no cadena vacía.
        expect(noteHasContent(nota("   \n  "))).toBe(false)
    })
})

describe("eventIsVisible", () => {
    it("los cambios se muestran siempre, incluso sin cuerpo", () => {
        expect(eventIsVisible({ ...nota(null), kind: "status" })).toBe(true)
        expect(eventIsVisible({ ...nota(null), kind: "item_added" })).toBe(true)
    })

    it("las notas se muestran solo si dicen algo", () => {
        expect(eventIsVisible(nota("hola"))).toBe(true)
        expect(eventIsVisible(nota("", [foto]))).toBe(true)
        expect(eventIsVisible(nota(""))).toBe(false)
    })
})
