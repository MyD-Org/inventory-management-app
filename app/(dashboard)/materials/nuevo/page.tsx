import { redirect } from "next/navigation"
import { auth } from "@/auth"
import NuevoMaterialForm from "./nuevo-material-form"

export const dynamic = 'force-dynamic';

// El formulario es un client component: el chequeo de rol vive acá, del lado del
// servidor, para que la pantalla ni siquiera se renderice para un operador.
// El bloqueo real está en POST /api/materials; esto es para que no vea la página.
export default async function NuevoMaterialPage() {
    const session = await auth()
    if (!session?.user) redirect('/login')
    if (session.user.role !== 'admin') redirect('/inventory')

    return <NuevoMaterialForm />
}
