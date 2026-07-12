"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Play, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  INTERVAL_PRESETS,
  OP_LABELS,
  type Automation,
  type AutomationAction,
  type AutomationOp,
} from "./automation-types"

type ActionType = AutomationAction["type"]

const ACTION_LABELS: Record<ActionType, string> = {
  email: "Email",
  webhook: "Webhook",
  whatsapp_template: "WhatsApp (template)",
}

function defaultAction(type: ActionType): AutomationAction {
  switch (type) {
    case "email":
      return { type: "email", to: "", subject: "", body: "" }
    case "webhook":
      return { type: "webhook", url: "", secret: "" }
    case "whatsapp_template":
      return { type: "whatsapp_template", to: "", templateName: "", params: [] }
  }
}

// Form controlado que usan tanto /automations/nuevo como /automations/[id].
// En edición, `automation` viene pre-cargado (server-side) y el submit hace PATCH;
// en creación, hace POST. La validación fuerte vive en ai-api (422 invalid_automation).
export function AutomationForm({ automation }: { automation?: Automation }) {
  const router = useRouter()
  const isEdit = Boolean(automation?.id)

  const [name, setName] = useState(automation?.name ?? "")
  const [sql, setSql] = useState(automation?.sql ?? "")
  const [mode, setMode] = useState<Automation["mode"]>(automation?.mode ?? "row")
  const [conditionColumn, setConditionColumn] = useState(automation?.condition.column ?? "")
  const [conditionOp, setConditionOp] = useState<AutomationOp>(automation?.condition.op ?? "gt")
  const [conditionValue, setConditionValue] = useState(String(automation?.condition.value ?? ""))
  const [entityKeyColumn, setEntityKeyColumn] = useState(automation?.entityKeyColumn ?? "")
  const [intervalMinutes, setIntervalMinutes] = useState(automation?.intervalMinutes ?? 60)
  const [rearmPolicy, setRearmPolicy] = useState<Automation["rearmPolicy"]>(automation?.rearmPolicy ?? "on_clear")
  const [remindEveryHours, setRemindEveryHours] = useState(automation?.remindEveryHours ?? 24)
  const [actions, setActions] = useState<AutomationAction[]>(automation?.actions ?? [defaultAction("email")])

  // "Probar query": pega contra el mismo endpoint que usa el dashboard builder
  // (/api/dashboards/query). Las columnas devueltas alimentan los selects de abajo.
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [testRows, setTestRows] = useState<Array<Record<string, unknown>>>([])
  const [columns, setColumns] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitErrors, setSubmitErrors] = useState<string[]>([])

  async function testQuery() {
    if (!sql.trim()) {
      setTestError("Escribí una consulta primero")
      return
    }
    setTestLoading(true)
    setTestError(null)
    try {
      const res = await fetch("/api/dashboards/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: sql, params: [] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      const rows: Array<Record<string, unknown>> = Array.isArray(data.rows) ? data.rows : []
      setTestRows(rows.slice(0, 5))
      setColumns(rows[0] ? Object.keys(rows[0]) : [])
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Error ejecutando la consulta")
    } finally {
      setTestLoading(false)
    }
  }

  function updateAction(index: number, patch: Partial<AutomationAction>) {
    setActions((prev) => prev.map((a, i) => (i === index ? ({ ...a, ...patch } as AutomationAction) : a)))
  }

  function changeActionType(index: number, type: ActionType) {
    setActions((prev) => prev.map((a, i) => (i === index ? defaultAction(type) : a)))
  }

  function addAction() {
    setActions((prev) => [...prev, defaultAction("email")])
  }

  function removeAction(index: number) {
    setActions((prev) => prev.filter((_, i) => i !== index))
  }

  function updateWhatsappParam(actionIndex: number, paramIndex: number, value: string) {
    setActions((prev) =>
      prev.map((a, i) => {
        if (i !== actionIndex || a.type !== "whatsapp_template") return a
        const params = [...(a.params ?? [])]
        params[paramIndex] = value
        return { ...a, params }
      }),
    )
  }

  function addWhatsappParam(actionIndex: number) {
    setActions((prev) =>
      prev.map((a, i) => (i === actionIndex && a.type === "whatsapp_template" ? { ...a, params: [...(a.params ?? []), ""] } : a)),
    )
  }

  function removeWhatsappParam(actionIndex: number, paramIndex: number) {
    setActions((prev) =>
      prev.map((a, i) =>
        i === actionIndex && a.type === "whatsapp_template"
          ? { ...a, params: (a.params ?? []).filter((_, p) => p !== paramIndex) }
          : a,
      ),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (actions.length === 0) {
      setSubmitError("Agregá al menos una acción")
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setSubmitErrors([])
    try {
      const isNumericOp = conditionOp !== "eq" && conditionOp !== "neq"
      const value = isNumericOp ? Number(conditionValue) : conditionValue
      const body: Record<string, unknown> = {
        name,
        sql,
        mode,
        condition: { column: conditionColumn, op: conditionOp, value },
        entityKeyColumn: mode === "row" && entityKeyColumn ? entityKeyColumn : undefined,
        intervalMinutes,
        rearmPolicy,
        remindEveryHours: rearmPolicy === "remind" ? remindEveryHours : undefined,
        actions,
      }
      if (!isEdit) body.createdBy = "form"

      const res = await fetch(isEdit ? `/api/automations/${automation!.id}` : "/api/automations", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 422 && Array.isArray(data.details)) {
          setSubmitErrors(data.details)
        } else {
          setSubmitError(data.error ?? `Error ${res.status}`)
        }
        return
      }
      toast.success(isEdit ? "Automatización actualizada" : "Automatización creada", { description: name })
      router.push("/automations")
      router.refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error inesperado")
    } finally {
      setSubmitting(false)
    }
  }

  const columnFieldProps = (value: string, onChange: (v: string) => void, placeholder: string) =>
    columns.length > 0 ? (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={`${placeholder} (probá la query para elegir de una lista)`} />
    )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {(submitError || submitErrors.length > 0) && (
        <Card className="border-destructive">
          <CardContent className="space-y-1 py-4 text-sm text-destructive">
            {submitError && <p>{submitError}</p>}
            {submitErrors.map((d, i) => (
              <p key={i}>• {d}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos generales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sql">Consulta SQL</Label>
            <Textarea
              id="sql"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder="SELECT cliente_id, email, dias_vencido FROM cuentas_por_cobrar WHERE ..."
              required
            />
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={testQuery} disabled={testLoading}>
                {testLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                Probar query
              </Button>
              {columns.length > 0 && (
                <span className="text-xs text-muted-foreground">{testRows.length} fila(s) de muestra</span>
              )}
            </div>
            {testError && <p className="text-sm text-destructive">{testError}</p>}
            {testRows.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((c) => (
                        <TableHead key={c}>{c}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {testRows.map((row, i) => (
                      <TableRow key={i}>
                        {columns.map((c) => (
                          <TableCell key={c} className="text-xs">
                            {String(row[c] ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Condición y frecuencia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Modo</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Automation["mode"])}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="row">Por fila (una alerta por entidad)</SelectItem>
                <SelectItem value="aggregate">Agregado (una alerta general)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "row" && (
            <div className="space-y-2">
              <Label>Columna de entidad</Label>
              {columnFieldProps(entityKeyColumn, setEntityKeyColumn, "Columna que identifica la entidad, ej cliente_id")}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Columna de condición</Label>
              {columnFieldProps(conditionColumn, setConditionColumn, "Columna")}
            </div>
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select value={conditionOp} onValueChange={(v) => setConditionOp(v as AutomationOp)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(OP_LABELS) as AutomationOp[]).map((op) => (
                    <SelectItem key={op} value={op}>
                      {OP_LABELS[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type={conditionOp === "eq" || conditionOp === "neq" ? "text" : "number"}
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Frecuencia de evaluación</Label>
              <Select value={String(intervalMinutes)} onValueChange={(v) => setIntervalMinutes(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Re-disparo</Label>
              <Select value={rearmPolicy} onValueChange={(v) => setRearmPolicy(v as Automation["rearmPolicy"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_clear">Solo al entrar en condición</SelectItem>
                  <SelectItem value="remind">Recordar cada N horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {rearmPolicy === "remind" && (
            <div className="space-y-2 sm:w-64">
              <Label>Recordar cada (horas)</Label>
              <Input
                type="number"
                min={1}
                value={remindEveryHours}
                onChange={(e) => setRemindEveryHours(Number(e.target.value))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {actions.map((action, i) => (
            <div key={i} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Select value={action.type} onValueChange={(v) => changeActionType(i, v as ActionType)}>
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {ACTION_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeAction(i)} title="Quitar acción">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              {action.type === "email" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Para</Label>
                    <Input
                      value={action.to}
                      onChange={(e) => updateAction(i, { to: e.target.value })}
                      placeholder="{{email}} o una dirección fija"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Asunto</Label>
                    <Input value={action.subject} onChange={(e) => updateAction(i, { subject: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cuerpo</Label>
                    <Textarea value={action.body} onChange={(e) => updateAction(i, { body: e.target.value })} rows={3} />
                    <p className="text-xs text-muted-foreground">
                      Acepta {"{{columna}}"} de la fila, ej {"{{email}}"}.
                    </p>
                  </div>
                </div>
              )}

              {action.type === "webhook" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input value={action.url} onChange={(e) => updateAction(i, { url: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Secret (opcional)</Label>
                    <Input value={action.secret ?? ""} onChange={(e) => updateAction(i, { secret: e.target.value })} />
                  </div>
                </div>
              )}

              {action.type === "whatsapp_template" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Requiere templates aprobados por Meta — hasta entonces la acción queda registrada como pendiente.
                  </p>
                  <div className="space-y-2">
                    <Label>Para</Label>
                    <Input value={action.to} onChange={(e) => updateAction(i, { to: e.target.value })} placeholder="{{telefono}}" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre del template</Label>
                    <Input value={action.templateName} onChange={(e) => updateAction(i, { templateName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Parámetros</Label>
                    {(action.params ?? []).map((p, pi) => (
                      <div key={pi} className="flex gap-2">
                        <Input value={p} onChange={(e) => updateWhatsappParam(i, pi, e.target.value)} />
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeWhatsappParam(i, pi)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => addWhatsappParam(i)}>
                      <Plus className="mr-1 h-4 w-4" /> Agregar parámetro
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addAction}>
            <Plus className="mr-1 h-4 w-4" /> Agregar acción
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/automations")}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {isEdit ? "Guardar cambios" : "Crear automatización"}
        </Button>
      </div>
    </form>
  )
}
