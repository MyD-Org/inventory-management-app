"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Loader2, KeyRound, Copy, Check } from "lucide-react"
import { createUser, deleteUser, resetUserPassword } from "@/lib/actions"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toast } from "sonner"

interface User {
    id: number
    name: string
    email: string
    role: string
    created_at: string
}

// Locale y zona FIJOS: toLocaleDateString() a secas usa los del entorno, que en
// el server (UTC, en-US) da "8/28/2026" y en el navegador "28/8/2026". React lo
// veía como contenido distinto y tiraba error de hidratación.
const FECHA = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
})

const fecha = (v: string) => FECHA.format(new Date(v))

interface UsersTableProps {
    initialUsers: any[]
}

export function UsersTable({ initialUsers }: UsersTableProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [pendingId, setPendingId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)
    // Reseteo de contraseña: se pregunta primero y después se muestra la
    // temporal UNA vez. No se guarda en ningún lado en claro, así que si se
    // cierra el cartel sin copiarla hay que volver a resetear.
    const [pendingReset, setPendingReset] = useState<{ id: number; name: string } | null>(null)
    const [resetting, setResetting] = useState(false)
    const [temporal, setTemporal] = useState<{ email: string; password: string } | null>(null)
    const [copiada, setCopiada] = useState(false)

    const doReset = async () => {
        if (!pendingReset) return
        setResetting(true)
        const result = await resetUserPassword(pendingReset.id)
        setResetting(false)
        if (result.error) {
            toast.error(result.error)
            return
        }
        setPendingReset(null)
        setCopiada(false)
        setTemporal({ email: result.email!, password: result.temporaryPassword! })
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData(e.currentTarget)
        const result = await createUser(formData)

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success("Usuario creado correctamente")
            setIsDialogOpen(false)
        }
        setLoading(false)
    }

    const doDelete = async () => {
        if (pendingId == null) return
        setDeleting(true)
        const result = await deleteUser(pendingId)
        setDeleting(false)
        if (result.error) {
            toast.error(result.error)
        } else {
            setPendingId(null)
            toast.success("Usuario eliminado")
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Lista de Usuarios</CardTitle>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Nuevo Usuario
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Agregar Nuevo Usuario</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nombre</Label>
                                <Input id="name" name="name" required placeholder="Juan Pérez" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" name="email" type="email" required placeholder="juan@ejemplo.com" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Contraseña</Label>
                                <Input id="password" name="password" type="password" required minLength={6} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Rol</Label>
                                <Select name="role" defaultValue="operator">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="operator">Operador</SelectItem>
                                        <SelectItem value="admin">Administrador</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear Usuario"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Rol</TableHead>
                            <TableHead>Fecha Creación</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {initialUsers.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.name}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                    <span className={`px-2 py-1 rounded-full text-xs ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                        {user.role === 'admin' ? 'Administrador' : 'Operador'}
                                    </span>
                                </TableCell>
                                <TableCell>{fecha(user.created_at)}</TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setPendingReset({ id: user.id, name: user.name })}
                                        title="Restablecer contraseña"
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        <KeyRound className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setPendingId(user.id)}
                                        title="Eliminar usuario"
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>

            <ConfirmDialog
                open={pendingReset != null}
                onOpenChange={(o) => !o && setPendingReset(null)}
                title="Restablecer contraseña"
                description={`Se genera una contraseña temporal para ${pendingReset?.name ?? ""}. La actual deja de funcionar y va a tener que elegir una nueva al entrar.`}
                confirmLabel="Restablecer"
                loading={resetting}
                onConfirm={doReset}
            />

            {/* Se muestra una sola vez: no queda guardada en claro en ningún lado. */}
            <Dialog open={temporal != null} onOpenChange={(o) => !o && setTemporal(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Contraseña temporal</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                            Pasásela a <span className="font-medium text-foreground">{temporal?.email}</span>. Al
                            entrar no va a poder hacer nada hasta cambiarla.
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-base tracking-wider">
                                {temporal?.password}
                            </code>
                            <Button
                                variant="outline"
                                size="icon"
                                title="Copiar"
                                onClick={async () => {
                                    if (!temporal) return
                                    await navigator.clipboard.writeText(temporal.password)
                                    setCopiada(true)
                                }}
                            >
                                {copiada ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </Button>
                        </div>
                        <p className="text-sm text-destructive">
                            Es la única vez que se muestra. Si cerrás sin copiarla, hay que restablecerla de nuevo.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={pendingId != null}
                onOpenChange={(o) => !o && setPendingId(null)}
                title="Eliminar usuario"
                description="Esta acción no se puede deshacer. ¿Querés eliminar este usuario?"
                confirmLabel="Eliminar"
                destructive
                loading={deleting}
                onConfirm={doDelete}
            />
        </Card>
    )
}
