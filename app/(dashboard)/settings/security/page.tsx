import { ChangePasswordForm } from "@/components/change-password-form"
import { auth } from "@/auth"

export default async function SecurityPage() {
    const session = await auth();

    return (
        <div className="bg-background">
            <main className="container mx-auto px-4 py-6">
                <div className="max-w-2xl mx-auto">
                    <h1 className="text-2xl font-bold mb-6">Seguridad</h1>
                    <ChangePasswordForm />
                </div>
            </main>
        </div>
    )
}
