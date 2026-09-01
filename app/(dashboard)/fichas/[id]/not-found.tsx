import { NotFoundScreen } from "@/components/not-found-screen"

// Nombra lo que no está y devuelve a SU lista, no al inicio: quien abrió esta
// dirección estaba buscando una cosa concreta y sigue queriendo esa.
export default function FichaNoEncontrada() {
    return (
        <NotFoundScreen
            title="Ficha no encontrada"
            description="Puede que se haya borrado o que la URL sea incorrecta."
            actionLabel="Ver las fichas"
            actionHref="/fichas"
        />
    )
}
