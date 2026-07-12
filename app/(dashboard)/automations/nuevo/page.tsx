import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { AutomationForm } from "@/components/automations/automation-form"

export const dynamic = "force-dynamic"

export default async function NewAutomationPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <main className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Nueva automatización</h1>
      <AutomationForm />
    </main>
  )
}
