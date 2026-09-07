# Sección de Gastos del admin — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sección `/gastos` (solo admin) para cargar los gastos operativos de la empresa, con categorías editables, total mensual, totales por categoría y detalle del mes editable/borrable.

**Architecture:** Server page thin (auth + queries con `sql` de `@/lib/database`) que delega la interactividad en componentes client, siguiendo el patrón de `app/(dashboard)/movimientos/page.tsx`. Lógica pura (validación + totales) en `lib/gastos.ts` testeada con vitest; server actions en `lib/gastos-actions.ts` con el patrón `{ error } | { ok: true }` de `lib/order-actions.ts`.

**Tech Stack:** Next.js 14 App Router, shadcn/ui (Dialog, Select, Input, Button, Switch, Label), Tailwind, `@neondatabase/serverless` vía `@/lib/database`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-gastos-admin-design.md`

**Desviación del spec (acordada en plan):** el spec menciona crear `formatMoney` en `lib/format.ts`; ya existe `formatArs` con exactamente ese formato ($ + miles con "." + decimales con ","). Se usa `formatArs`, no se crea función nueva.

**Rama de trabajo:** `feat/gastos-admin` (creada al inicio de la Task 1).

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `scripts/35-gastos.sql` | Migración: tablas `expense_categories` y `expenses` |
| `lib/gastos.ts` | Tipos compartidos, `PAYMENT_METHODS`, `validateExpense` y `totalesPorCategoria` (puros, testeables) |
| `lib/__tests__/gastos.test.ts` | Tests de validación y totales |
| `lib/gastos-actions.ts` | Server actions: `saveExpense`, `deleteExpense`, `createExpenseCategory`, `renameExpenseCategory`, `setExpenseCategoryActive` |
| `components/expense-dialog.tsx` | Modal de alta/edición de un gasto |
| `components/gastos-client.tsx` | Lista del mes con botón "Nuevo gasto", editar y borrar |
| `components/expense-categories.tsx` | Manager de categorías (crear/renombrar/activar) |
| `app/(dashboard)/gastos/page.tsx` | Server page: auth admin, queries, total del mes, barras por categoría |
| `components/app-shell.tsx` | Ítem "Gastos" en el sidebar (sección Gestión, `adminOnly`) |

---

### Task 1: Migración SQL

**Files:**
- Create: `scripts/35-gastos.sql`

- [ ] **Step 1: Crear la rama y el archivo de migración**

```bash
git checkout -b feat/gastos-admin main
```

`scripts/35-gastos.sql`:

```sql
-- Sección de gastos operativos del admin.
-- Spec: docs/superpowers/specs/2026-09-07-gastos-admin-design.md
CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,  -- 'efectivo' | 'transferencia' | 'tarjeta' | 'otro'
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
```

- [ ] **Step 2: Aplicar la migración contra la base local (.env.local)**

Run: `node scripts/run-sql.js scripts/35-gastos.sql`
Expected: termina sin error (el script imprime el resultado de cada statement).

- [ ] **Step 3: Verificar que las tablas existen**

Run:
```bash
node -e "require('dotenv').config({path:'.env.local'});const{neon}=require('@neondatabase/serverless');neon(process.env.DATABASE_URL)\`SELECT count(*)::int AS n FROM expense_categories\`.then(r=>console.log('tablas OK:',r))"
```
Expected: `tablas OK: [ { n: 0 } ]`

- [ ] **Step 4: Commit**

```bash
git add scripts/35-gastos.sql
git commit -m "chore(db): migración de la sección de gastos del admin"
```

---

### Task 2: Lógica pura — validación y totales (TDD)

**Files:**
- Create: `lib/gastos.ts`
- Test: `lib/__tests__/gastos.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`lib/__tests__/gastos.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { totalesPorCategoria, validateExpense } from "@/lib/gastos"

const HOY = new Date()
const hoyStr = `${HOY.getFullYear()}-${String(HOY.getMonth() + 1).padStart(2, "0")}-${String(HOY.getDate()).padStart(2, "0")}`
const MANIANA = new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + 1)
const manianaStr = `${MANIANA.getFullYear()}-${String(MANIANA.getMonth() + 1).padStart(2, "0")}-${String(MANIANA.getDate()).padStart(2, "0")}`

const valido = {
    expense_date: hoyStr,
    category_id: 1,
    description: "Factura de luz",
    amount: "96800.00",
    payment_method: "transferencia",
}

describe("validateExpense", () => {
    it("acepta un gasto válido", () => {
        expect(validateExpense(valido, { activeCategoryIds: [1] })).toEqual([])
    })

    it("rechaza monto 0, negativo y no numérico", () => {
        expect(validateExpense({ ...valido, amount: 0 }, { activeCategoryIds: [1] })).toHaveLength(1)
        expect(validateExpense({ ...valido, amount: -5 }, { activeCategoryIds: [1] })).toHaveLength(1)
        expect(validateExpense({ ...valido, amount: "abc" }, { activeCategoryIds: [1] })).toHaveLength(1)
    })

    it("rechaza descripción vacía o solo espacios", () => {
        expect(validateExpense({ ...valido, description: "   " }, { activeCategoryIds: [1] })).toHaveLength(1)
    })

    it("rechaza fecha futura e inválida", () => {
        expect(validateExpense({ ...valido, expense_date: manianaStr }, { activeCategoryIds: [1] })).toHaveLength(1)
        expect(validateExpense({ ...valido, expense_date: "05/09/2026" }, { activeCategoryIds: [1] })).toHaveLength(1)
    })

    it("rechaza categoría inactiva o inexistente", () => {
        expect(validateExpense(valido, { activeCategoryIds: [2] })).toHaveLength(1)
        expect(validateExpense(valido, { activeCategoryIds: [] })).toHaveLength(1)
    })

    it("en edición conserva la categoría aunque se haya desactivado", () => {
        expect(
            validateExpense(valido, { activeCategoryIds: [2], allowInactiveCategoryId: 1 })
        ).toEqual([])
    })

    it("rechaza medio de pago inválido", () => {
        expect(validateExpense({ ...valido, payment_method: "cheque" }, { activeCategoryIds: [1] })).toHaveLength(1)
    })
})

describe("totalesPorCategoria", () => {
    const gastos = [
        { category_id: 1, category_name: "Servicios", amount: "100.00" },
        { category_id: 2, category_name: "Alquiler", amount: "300.00" },
        { category_id: 1, category_name: "Servicios", amount: "100.00" },
    ]

    it("suma por categoría, ordena descendente y calcula el %", () => {
        const totales = totalesPorCategoria(gastos)
        expect(totales).toEqual([
            { category_id: 2, nombre: "Alquiler", monto: 300, pct: 0.6 },
            { category_id: 1, nombre: "Servicios", monto: 200, pct: 0.4 },
        ])
    })

    it("devuelve lista vacía sin gastos", () => {
        expect(totalesPorCategoria([])).toEqual([])
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/__tests__/gastos.test.ts`
Expected: FAIL — `Cannot find module '@/lib/gastos'`.

- [ ] **Step 3: Implementación mínima**

`lib/gastos.ts`:

```ts
// Validación y totales de gastos. Funciones puras (sin base de datos) para
// poder testearlas con vitest; las server actions de lib/gastos-actions.ts
// las usan antes de tocar la base.

export const PAYMENT_METHODS = [
    { value: "efectivo", label: "Efectivo" },
    { value: "transferencia", label: "Transferencia" },
    { value: "tarjeta", label: "Tarjeta" },
    { value: "otro", label: "Otro" },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"]

const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value) as string[]

export interface CategoriaGasto {
    id: number
    name: string
    active: boolean
}

export interface GastoRow {
    id: number
    expense_date: string // YYYY-MM-DD
    description: string
    amount: string // numeric(12,2): el driver lo entrega como string
    payment_method: string
    category_id: number
    category_name: string
}

export interface ExpenseInput {
    expense_date: string
    category_id: number
    description: string
    amount: number | string
    payment_method: string
}

// activeCategoryIds: categorías que se pueden elegir en el alta.
// allowInactiveCategoryId: en edición, la categoría actual del gasto se acepta
// aunque haya sido desactiva después de cargarlo (no se fuerza a recategorizar).
export function validateExpense(
    input: ExpenseInput,
    opts: { activeCategoryIds: number[]; allowInactiveCategoryId?: number | null }
): string[] {
    const errors: string[] = []

    if (!input.description?.trim()) errors.push("La descripción es obligatoria")

    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) errors.push("El monto tiene que ser un número mayor a 0")

    const date = input.expense_date ?? ""
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push("La fecha es obligatoria")
    } else {
        const today = new Date()
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
            today.getDate()
        ).padStart(2, "0")}`
        if (date > todayStr) errors.push("La fecha no puede ser futura")
    }

    const permitida =
        opts.activeCategoryIds.includes(input.category_id) ||
        input.category_id === (opts.allowInactiveCategoryId ?? null)
    if (!permitida) errors.push("Elegí una categoría activa")

    if (!PAYMENT_METHOD_VALUES.includes(input.payment_method)) errors.push("Medio de pago inválido")

    return errors
}

export interface TotalPorCategoria {
    category_id: number
    nombre: string
    monto: number
    pct: number
}

// Barras del resumen mensual: suma por categoría, orden descendente por monto
// y porcentaje sobre el total del mes.
export function totalesPorCategoria(
    expenses: { category_id: number; category_name: string; amount: number | string }[]
): TotalPorCategoria[] {
    const porCategoria = new Map<number, TotalPorCategoria>()
    let total = 0
    for (const e of expenses) {
        const monto = Number(e.amount)
        if (!Number.isFinite(monto)) continue
        total += monto
        const actual = porCategoria.get(e.category_id)
        if (actual) {
            actual.monto += monto
        } else {
            porCategoria.set(e.category_id, { category_id: e.category_id, nombre: e.category_name, monto, pct: 0 })
        }
    }
    return Array.from(porCategoria.values())
        .map((t) => ({ ...t, pct: total > 0 ? t.monto / total : 0 }))
        .sort((a, b) => b.monto - a.monto)
}

export function labelMedioPago(value: string): string {
    return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value
}

// "2026-09-05" -> "05/09" para la columna fecha del detalle.
export function formatearFechaCorta(date: string): string {
    const [, m, d] = date.split("-")
    return `${d}/${m}`
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/__tests__/gastos.test.ts`
Expected: PASS (15 tests: 7 de validateExpense + 2 de totalesPorCategoria, contados por `it`).

- [ ] **Step 5: Commit**

```bash
git add lib/gastos.ts lib/__tests__/gastos.test.ts
git commit -m "feat(gastos): validación y totales por categoría (lógica pura)"
```

---

### Task 3: Server actions

**Files:**
- Create: `lib/gastos-actions.ts`

- [ ] **Step 1: Escribir el archivo**

`lib/gastos-actions.ts`:

```ts
'use server'

// Server actions de la sección de gastos. Mismo patrón que lib/order-actions.ts:
// auth() por acción, re-validación del rol admin (no se confía en la UI),
// resultado { error } | { ok: true }, revalidatePath al mutar.

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { sql } from '@/lib/database'
import { validateExpense, type ExpenseInput } from '@/lib/gastos'

export async function saveExpense(id: number | null, input: ExpenseInput) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    const categories = await sql`SELECT id, active FROM expense_categories`
    const activeIds = categories.filter((c) => c.active).map((c) => Number(c.id))

    // En edición, la categoría actual del gasto se acepta aunque esté inactiva.
    let allowInactiveCategoryId: number | null = null
    if (id !== null) {
        const rows = await sql`SELECT category_id FROM expenses WHERE id = ${id}`
        if (rows.length === 0) return { error: 'El gasto no existe' }
        allowInactiveCategoryId = Number(rows[0].category_id)
    }

    const errors = validateExpense(input, { activeCategoryIds: activeIds, allowInactiveCategoryId })
    if (errors.length > 0) return { error: errors.join('. ') }

    const createdBy = session.user.name ?? session.user.email ?? 'admin'

    try {
        if (id === null) {
            await sql`
                INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, created_by)
                VALUES (${input.expense_date}, ${input.category_id}, ${input.description.trim()},
                        ${input.amount}, ${input.payment_method}, ${createdBy})
            `
        } else {
            await sql`
                UPDATE expenses
                SET expense_date = ${input.expense_date},
                    category_id = ${input.category_id},
                    description = ${input.description.trim()},
                    amount = ${input.amount},
                    payment_method = ${input.payment_method}
                WHERE id = ${id}
            `
        }
        revalidatePath('/gastos')
        return { ok: true as const }
    } catch (error) {
        console.error('Error en saveExpense:', error)
        return { error: 'No se pudo guardar el gasto' }
    }
}

export async function deleteExpense(id: number) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    try {
        await sql`DELETE FROM expenses WHERE id = ${id}`
        revalidatePath('/gastos')
        return { ok: true as const }
    } catch (error) {
        console.error('Error en deleteExpense:', error)
        return { error: 'No se pudo borrar el gasto' }
    }
}

export async function createExpenseCategory(name: string) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    const trimmed = name?.trim() ?? ''
    if (!trimmed) return { error: 'El nombre no puede estar vacío' }

    try {
        const dup = await sql`
            SELECT id FROM expense_categories WHERE lower(name) = lower(${trimmed})
        `
        if (dup.length > 0) return { error: 'Ya existe una categoría con ese nombre' }

        await sql`INSERT INTO expense_categories (name) VALUES (${trimmed})`
        revalidatePath('/gastos')
        return { ok: true as const }
    } catch (error) {
        console.error('Error en createExpenseCategory:', error)
        return { error: 'No se pudo crear la categoría' }
    }
}

export async function renameExpenseCategory(id: number, name: string) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    const trimmed = name?.trim() ?? ''
    if (!trimmed) return { error: 'El nombre no puede estar vacío' }

    try {
        await sql`UPDATE expense_categories SET name = ${trimmed} WHERE id = ${id}`
        revalidatePath('/gastos')
        return { ok: true as const }
    } catch (error) {
        console.error('Error en renameExpenseCategory:', error)
        return { error: 'No se pudo renombrar la categoría' }
    }
}

export async function setExpenseCategoryActive(id: number, active: boolean) {
    const session = await auth()
    if (session?.user?.role !== 'admin') return { error: 'Solo un admin puede gestionar gastos' }

    try {
        await sql`UPDATE expense_categories SET active = ${active} WHERE id = ${id}`
        revalidatePath('/gastos')
        return { ok: true as const }
    } catch (error) {
        console.error('Error en setExpenseCategoryActive:', error)
        return { error: 'No se pudo actualizar la categoría' }
    }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/gastos-actions.ts
git commit -m "feat(gastos): server actions de gastos y categorías"
```

---

### Task 4: Modal de alta/edición de gasto

**Files:**
- Create: `components/expense-dialog.tsx`

- [ ] **Step 1: Escribir el componente**

`components/expense-dialog.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { saveExpense } from "@/lib/gastos-actions"
import { PAYMENT_METHODS, type CategoriaGasto, type GastoRow } from "@/lib/gastos"

// Modal de alta/edición. El control ES el valor (estilo Linear): al elegir o
// salir del campo se guarda solo con el submit. En edición, si la categoría
// del gasto fue desactiva después, se la sigue ofreciendo (no se fuerza a
// recategorizar), criterio que también valida la server action.
export function ExpenseDialog({
    open,
    onOpenChange,
    expense,
    categories,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    expense: GastoRow | null
    categories: CategoriaGasto[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    const [expenseDate, setExpenseDate] = useState("")
    const [categoryId, setCategoryId] = useState("")
    const [description, setDescription] = useState("")
    const [amount, setAmount] = useState("")
    const [paymentMethod, setPaymentMethod] = useState("transferencia")

    const hoy = new Date().toLocaleDateString("sv") // YYYY-MM-DD local

    // Al abrir (o cambiar el gasto en edición) se precargan los campos.
    useEffect(() => {
        if (!open) return
        setExpenseDate(expense?.expense_date ?? hoy)
        setCategoryId(expense ? String(expense.category_id) : "")
        setDescription(expense?.description ?? "")
        setAmount(expense ? String(Number(expense.amount)) : "")
        setPaymentMethod(expense?.payment_method ?? "transferencia")
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, expense])

    const opcionesCategoria = expense
        ? categories.filter((c) => c.active || c.id === expense.category_id)
        : categories.filter((c) => c.active)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!categoryId) {
            toast.error("Falta la categoría", { description: "Creá una en “Categorías” si todavía no hay." })
            return
        }
        setSaving(true)
        const result = await saveExpense(expense?.id ?? null, {
            expense_date: expenseDate,
            category_id: Number(categoryId),
            description,
            amount,
            payment_method: paymentMethod,
        })
        setSaving(false)
        if (result.error) {
            toast.error("No se pudo guardar el gasto", { description: result.error })
            return
        }
        toast.success(expense ? "Gasto actualizado" : "Gasto cargado")
        onOpenChange(false)
        router.refresh()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{expense ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="gasto-fecha">Fecha</Label>
                            <Input
                                id="gasto-fecha"
                                type="date"
                                value={expenseDate}
                                max={hoy}
                                onChange={(e) => setExpenseDate(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="gasto-monto">Monto</Label>
                            <Input
                                id="gasto-monto"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Categoría</Label>
                        <Select value={categoryId} onValueChange={setCategoryId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Elegí una categoría" />
                            </SelectTrigger>
                            <SelectContent>
                                {opcionesCategoria.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="gasto-desc">Descripción</Label>
                        <Input
                            id="gasto-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Ej: Factura de luz"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Medio de pago</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PAYMENT_METHODS.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Guardando…" : "Guardar gasto"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/expense-dialog.tsx
git commit -m "feat(gastos): modal de alta y edición de gasto"
```

---

### Task 5: Lista del mes (client)

**Files:**
- Create: `components/gastos-client.tsx`

- [ ] **Step 1: Escribir el componente**

`components/gastos-client.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ExpenseDialog } from "@/components/expense-dialog"
import { useToast } from "@/hooks/use-toast"
import { deleteExpense } from "@/lib/gastos-actions"
import { formatArs } from "@/lib/format"
import { formatearFechaCorta, labelMedioPago, type CategoriaGasto, type GastoRow } from "@/lib/gastos"

// Detalle del mes: la lista con editar/borrar, el botón "Nuevo gasto" y los
// dos diálogos. Recibe todo como props desde la server page; no consulta la
// base, solo dispara actions y refresca.
export function GastosClient({
    expenses,
    categories,
}: {
    expenses: GastoRow[]
    categories: CategoriaGasto[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<GastoRow | null>(null)
    const [pendingDelete, setPendingDelete] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)

    async function doDelete() {
        if (pendingDelete === null) return
        setDeleting(true)
        const result = await deleteExpense(pendingDelete)
        setDeleting(false)
        setPendingDelete(null)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        toast.success("Gasto eliminado")
        router.refresh()
    }

    return (
        <>
            <div className="mb-3 flex justify-end">
                <Button
                    size="sm"
                    onClick={() => {
                        setEditing(null)
                        setDialogOpen(true)
                    }}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo gasto
                </Button>
            </div>

            {expenses.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    No hay gastos cargados en este mes.
                </p>
            ) : (
                <div className="overflow-hidden rounded-lg border">
                    {expenses.map((g) => (
                        <div
                            key={g.id}
                            className="group flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 last:border-b-0 hover:bg-muted/50"
                        >
                            <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                                {formatearFechaCorta(g.expense_date)}
                            </span>
                            <span className="min-w-0 flex-1 basis-40">
                                <span className="block truncate text-sm font-medium">{g.description}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {g.category_name} · {labelMedioPago(g.payment_method)}
                                </span>
                            </span>
                            <span className="tabular-nums text-sm font-semibold">{formatArs(Number(g.amount))}</span>
                            <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Editar"
                                    onClick={() => {
                                        setEditing(g)
                                        setDialogOpen(true)
                                    }}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Borrar"
                                    onClick={() => setPendingDelete(g.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <ExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} expense={editing} categories={categories} />

            <ConfirmDialog
                open={pendingDelete !== null}
                onOpenChange={(open) => !open && setPendingDelete(null)}
                title="Eliminar gasto"
                description="Se borra el gasto cargado. No se puede deshacer."
                confirmLabel="Eliminar"
                destructive
                loading={deleting}
                onConfirm={doDelete}
            />
        </>
    )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/gastos-client.tsx
git commit -m "feat(gastos): lista del mes con editar y borrar"
```

---

### Task 6: Manager de categorías

**Files:**
- Create: `components/expense-categories.tsx`

- [ ] **Step 1: Escribir el componente**

`components/expense-categories.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Check, Pencil, Plus, Tag, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
    createExpenseCategory,
    renameExpenseCategory,
    setExpenseCategoryActive,
} from "@/lib/gastos-actions"
import type { CategoriaGasto } from "@/lib/gastos"

// Las categorías se administran acá, no en código: crear, renombrar y
// activar/desactivar. No hay borrado físico: una categoría usada por gastos
// viejos se desactiva y desaparece del selector de carga.
export function ExpenseCategoriesManager({ categories }: { categories: CategoriaGasto[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [nueva, setNueva] = useState("")
    const [editandoId, setEditandoId] = useState<number | null>(null)
    const [editandoNombre, setEditandoNombre] = useState("")
    const [saving, setSaving] = useState(false)

    async function agregar() {
        if (!nueva.trim()) return
        setSaving(true)
        const result = await createExpenseCategory(nueva)
        setSaving(false)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        setNueva("")
        toast.success("Categoría creada")
        router.refresh()
    }

    async function guardarRenombre(id: number) {
        if (!editandoNombre.trim()) return
        setSaving(true)
        const result = await renameExpenseCategory(id, editandoNombre)
        setSaving(false)
        setEditandoId(null)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        toast.success("Categoría renombrada")
        router.refresh()
    }

    async function toggle(id: number, active: boolean) {
        const result = await setExpenseCategoryActive(id, active)
        if (result.error) {
            toast.error("Error", { description: result.error })
            return
        }
        router.refresh()
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Tag className="mr-2 h-4 w-4" />
                    Categorías
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Categorías de gasto</DialogTitle>
                </DialogHeader>

                <div className="flex gap-2">
                    <Input
                        placeholder="Nueva categoría"
                        value={nueva}
                        onChange={(e) => setNueva(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault()
                                agregar()
                            }
                        }}
                    />
                    <Button variant="outline" onClick={agregar} disabled={!nueva.trim() || saving} aria-label="Agregar categoría">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>

                <div className="mt-4 space-y-1.5">
                    {categories.length === 0 && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                            Todavía no hay categorías. Creá la primera arriba.
                        </p>
                    )}
                    {categories.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                            {editandoId === c.id ? (
                                <>
                                    <Input
                                        value={editandoNombre}
                                        onChange={(e) => setEditandoNombre(e.target.value)}
                                        className="h-8"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault()
                                                guardarRenombre(c.id)
                                            }
                                        }}
                                    />
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Guardar" onClick={() => guardarRenombre(c.id)}>
                                        <Check className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Cancelar" onClick={() => setEditandoId(null)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <span className={`flex-1 truncate text-sm ${c.active ? "" : "text-muted-foreground line-through"}`}>
                                        {c.name}
                                    </span>
                                    <Switch checked={c.active} onCheckedChange={(v) => toggle(c.id, v)} aria-label={`${c.name} activa`} />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        title="Renombrar"
                                        onClick={() => {
                                            setEditandoId(c.id)
                                            setEditandoNombre(c.name)
                                        }}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/expense-categories.tsx
git commit -m "feat(gastos): manager de categorías (crear, renombrar, activar)"
```

---

### Task 7: Server page y navegación

**Files:**
- Create: `app/(dashboard)/gastos/page.tsx`
- Modify: `components/app-shell.tsx` (sección Gestión, ~línea 100)

- [ ] **Step 1: Escribir la server page**

`app/(dashboard)/gastos/page.tsx`:

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sql } from "@/lib/database"
import { formatArs } from "@/lib/format"
import { totalesPorCategoria, type CategoriaGasto, type GastoRow } from "@/lib/gastos"
import { GastosClient } from "@/components/gastos-client"
import { ExpenseCategoriesManager } from "@/components/expense-categories"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

export const dynamic = "force-dynamic"

const NOMBRES_MES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

// Paleta de la marca para las barras del resumen (cicla si hay más categorías).
const COLORES_BARRA = ["#2b2018", "#8a6d4b", "#b3936b", "#c9a876", "#d9c4a3", "#e8dcc8"]

function mesActual(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function mesOffset(mes: string, delta: number): string {
    const [y, m] = mes.split("-").map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default async function GastosPage({
    searchParams,
}: {
    searchParams: { mes?: string }
}) {
    const session = await auth()
    if (!session?.user) redirect("/login")
    if (session.user.role !== "admin") redirect("/")

    const rawMes = typeof searchParams.mes === "string" ? searchParams.mes : ""
    const mes = /^\d{4}-\d{2}$/.test(rawMes) ? rawMes : mesActual()

    // DATE y NUMERIC llegan como string del driver; los casts ::text lo hacen
    // explícito y el cliente recibe JSON serializable.
    const expenses = (await sql`
        SELECT e.id, e.expense_date::text AS expense_date, e.description,
               e.amount::text AS amount, e.payment_method, e.category_id,
               c.name AS category_name
        FROM expenses e
        JOIN expense_categories c ON c.id = e.category_id
        WHERE to_char(e.expense_date, 'YYYY-MM') = ${mes}
        ORDER BY e.expense_date DESC, e.id DESC
    `) as unknown as GastoRow[]

    const categories = (await sql`
        SELECT id, name, active FROM expense_categories ORDER BY lower(name)
    `) as unknown as CategoriaGasto[]

    const totalMes = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
    const totales = totalesPorCategoria(expenses)

    return (
        <div className="bg-background">
            <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Gastos</h1>
                        <p className="mt-1 text-sm text-muted-foreground">Gastos operativos de la empresa</p>
                    </div>
                    <ExpenseCategoriesManager categories={categories} />
                </div>

                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <Link href={`/gastos?mes=${mesOffset(mes, -1)}`} aria-label="Mes anterior">
                                <ChevronLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <span className="px-2 text-lg font-semibold capitalize">
                            {NOMBRES_MES[Number(mes.slice(5)) - 1]} {mes.slice(0, 4)}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <Link href={`/gastos?mes=${mesOffset(mes, 1)}`} aria-label="Mes siguiente">
                                <ChevronRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                    <div className="text-right">
                        <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                            Total del mes
                        </p>
                        <p className="text-3xl font-bold tabular-nums">{formatArs(totalMes)}</p>
                    </div>
                </div>

                <section>
                    <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                        Por categoría
                    </p>
                    {totales.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {totales.map((t, i) => (
                                <div key={t.category_id}>
                                    <div className="mb-1 flex items-baseline justify-between text-sm">
                                        <span className="font-medium">{t.nombre}</span>
                                        <span className="tabular-nums text-muted-foreground">
                                            {formatArs(t.monto)} · {Math.round(t.pct * 100)}%
                                        </span>
                                    </div>
                                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${t.pct * 100}%`,
                                                background: COLORES_BARRA[i % COLORES_BARRA.length],
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                        Detalle del mes
                    </p>
                    <GastosClient expenses={expenses} categories={categories} />
                </section>
            </main>
        </div>
    )
}
```

- [ ] **Step 2: Agregar el ítem al sidebar**

En `components/app-shell.tsx`, en la sección `Gestión` del array `sections` (después del ítem "Mano de Obra"), agregar:

```tsx
      { label: "Gastos", href: "/gastos", icon: Wallet, adminOnly: true },
```

Y en el import de lucide-react agregar `Wallet` a la lista (alfabéticamente queda al final, después de `X`):

```tsx
  X,
  Wallet,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/gastos/page.tsx components/app-shell.tsx
git commit -m "feat(gastos): página /gastos con total mensual y barras por categoría"
```

---

### Task 8: Verificación de punta a punta y PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Tests + typecheck completos**

Run: `npm test && npx tsc --noEmit`
Expected: 93 tests existentes + 9 nuevos = 102 tests, todos verdes; tsc sin errores.

- [ ] **Step 2: Verificación manual con el dev server**

Run: `npm run dev` y abrir `http://localhost:3006/gastos` con un usuario admin:

1. Crear dos categorías ("Servicios", "Alquiler") desde el botón Categorías.
2. Cargar un gasto de cada categoría con "Nuevo gasto" → aparecen en el detalle, el total del mes y las barras se actualizan.
3. Editar el monto de uno → se refleja en total y barras.
4. Borrar uno → desaparece con confirmación.
5. Navegar con las flechas del mes → mes vacío muestra "No hay gastos cargados en este mes."
6. Desactivar una categoría → desaparece del selector del modal (un gasto ya cargado con esa categoría sigue pudiendo editarse conservándola).
7. Con un usuario operador: no ver el ítem "Gastos" en el sidebar; entrar a `/gastos` directo redirige a `/`.

- [ ] **Step 3: Push y PR**

```bash
git push -u origin feat/gastos-admin
gh pr create --base main --title "feat(gastos): sección de gastos operativos del admin" --body "Según spec: docs/superpowers/specs/2026-09-07-gastos-admin-design.md"
```

Expected: URL del PR impresa.

---

## Self-Review (realizado al escribir el plan)

- **Cobertura del spec:** modelo de datos (Task 1), validación/totales testeados (Task 2), CRUD con permisos (Task 3), modal (Task 4), detalle con editar/borrar (Task 5), categorías editables (Task 6), página con total mensual + barras + navegación por mes + nav admin-only (Task 7), verificación (Task 8). Las secciones "Errores" y "Testing" del spec quedan cubiertas por Tasks 3, 2 y 8.
- **Placeholders:** ninguno; todo paso con código tiene el código completo.
- **Consistencia de nombres:** `validateExpense`, `totalesPorCategoria`, `saveExpense`, `deleteExpense`, `createExpenseCategory`, `renameExpenseCategory`, `setExpenseCategoryActive`, `ExpenseDialog`, `GastosClient`, `ExpenseCategoriesManager`, tipos `GastoRow` / `CategoriaGasto` / `ExpenseInput`, helpers `labelMedioPago` / `formatearFechaCorta` — idénticos en todas las tareas.
- **Dev spec:** el plan usa `formatArs` existente en vez de crear `formatMoney` (anotado al inicio).
