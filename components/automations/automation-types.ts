// Tipos flat del contrato de automatizaciones (ver Global Constraints del plan
// docs/superpowers/plans/2026-07-11-automations-host.md y platform/contracts/automations.md).
// Sin dependencias de React: los consumen tanto las páginas/componentes de este
// repo (Task 3) como la card de propuestas del chat (Task 4).

export type AutomationMode = "row" | "aggregate"
export type AutomationOp = "gt" | "gte" | "lt" | "lte" | "eq" | "neq"
export type RearmPolicy = "on_clear" | "remind"
export type CreatedBy = "chat" | "form"

export interface AutomationCondition {
  column: string
  op: AutomationOp
  value: string | number
}

export type AutomationAction =
  | { type: "email"; to: string; subject: string; body: string }
  | { type: "webhook"; url: string; secret?: string }
  | { type: "whatsapp_template"; to: string; templateName: string; params?: string[] }

// Input aceptado por POST/PATCH /v1/automations (mismo shape que la tool emit_automation).
export interface AutomationInput {
  id?: string
  name: string
  sql: string
  mode: AutomationMode
  condition: AutomationCondition
  entityKeyColumn?: string
  intervalMinutes: number
  rearmPolicy: RearmPolicy
  remindEveryHours?: number
  actions: AutomationAction[]
  dashboardId?: string
  createdBy: CreatedBy
}

// Shape de lectura: input + campos que mantiene el motor de ai-api.
export interface Automation extends AutomationInput {
  id: string
  enabled: boolean
  pausedReason: "auto_failures" | null
  lastRunAt: string | null
  lastRunStatus: "ok" | "error" | null
  nextRunAt: string | null
  consecutiveFailures: number
  createdAt: string
}

export type AutomationActionStatus = "sent" | "failed" | "skipped"

export interface AutomationActionResult {
  type: AutomationAction["type"]
  status: AutomationActionStatus
  detail?: string
}

export interface AutomationEvent {
  id: string
  automationId: string
  entityKey: string
  kind: "enter" | "remind"
  rowSnapshot: Record<string, unknown>
  actionsResult: AutomationActionResult[]
  firedAt: string
}

export interface AutomationRun {
  id?: string
  automationId?: string
  startedAt: string
  finishedAt: string | null
  status: "running" | "ok" | "error"
  rowsReturned: number | null
  matched: number | null
  fired: number | null
  error: string | null
}

export const OP_LABELS: Record<AutomationOp, string> = {
  gt: "mayor a",
  gte: "mayor o igual",
  lt: "menor a",
  lte: "menor o igual",
  eq: "igual a",
  neq: "distinto de",
}

const OP_SYMBOLS: Record<AutomationOp, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  eq: "=",
  neq: "!=",
}

const INTERVAL_PRESETS = [
  { value: 5, label: "5 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 240, label: "4 horas" },
  { value: 1440, label: "1 día" },
]

export { INTERVAL_PRESETS }

function describeAction(action: AutomationAction): string {
  switch (action.type) {
    case "email":
      return `email a ${action.to}`
    case "webhook":
      return `webhook a ${action.url}`
    case "whatsapp_template":
      return `WhatsApp (${action.templateName}) a ${action.to}`
    default:
      return "acción desconocida"
  }
}

// Resumen humano de una automatización, ej:
// "dias > 30, por cliente_id, cada 60 min → email a {{email}}"
export function describeAutomation(a: AutomationInput): string {
  const parts: string[] = [`${a.condition.column} ${OP_SYMBOLS[a.condition.op]} ${a.condition.value}`]
  if (a.mode === "row" && a.entityKeyColumn) parts.push(`por ${a.entityKeyColumn}`)
  parts.push(`cada ${a.intervalMinutes} min`)
  const actionsDesc = a.actions.length > 0 ? a.actions.map(describeAction).join(", ") : "sin acciones"
  return `${parts.join(", ")} → ${actionsDesc}`
}
