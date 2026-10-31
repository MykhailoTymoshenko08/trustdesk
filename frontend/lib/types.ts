// mirrors docs/PLAN.md section 3 (API contract) - do not change without updating the plan

export type TicketStatus = "new" | "triaged" | "in_incident" | "resolved" | "needs_human";
export type Verdict = "bug" | "user_error" | "request" | "unclear";
export type PolicyDecision = "auto" | "needs_approval" | "forbidden";
export type ActionType = "send_message" | "grant_free_lesson" | "reschedule_lesson" | "refund";
export type IncidentStatus = "open" | "mitigating" | "resolved";

export interface Evidence {
  type: "log" | "doc";
  ref: string;
  text: string;
}

export interface Triage {
  intent: string;
  feature: string;
  verdict: Verdict;
  confidence: number;
  abstained: boolean;
  evidence: Evidence[];
  suggested_reply: string;
  injection_detected: boolean;
}

export interface Ticket {
  id: string;
  user_id: string;
  user_name: string;
  channel: string;
  text: string;
  created_at: string;
  status: TicketStatus;
  incident_id: string | null;
  triage: Triage | null;
}

export interface Impact {
  affected_users: number;
  silent_users: number;
  reporting_users: number;
  missed_lessons: number;
  money_at_risk_cents: number;
  breakdown: {
    missed_lessons_value_cents: number;
    renewals_at_risk_cents: number;
  };
}

export interface Incident {
  id: string;
  title: string;
  feature: string;
  signal: { error_code: string; release: string };
  status: IncidentStatus;
  ticket_count: number;
  first_seen: string;
  last_seen: string;
  impact: Impact;
}

export interface SilentUser {
  id: string;
  name: string;
  last_error_at: string;
}

export interface IncidentDetail {
  incident: Incident;
  tickets: Ticket[];
  silent_users: SilentUser[];
}

export interface ActionProposal {
  action: ActionType;
  user_id: string;
  params: Record<string, unknown>;
  reason: string;
  policy: { decision: PolicyDecision; rule: string };
  idempotency_key: string;
}

export interface PlanSummary {
  auto: number;
  needs_approval: number;
  forbidden: number;
}

export interface Plan {
  plan_id: string;
  proposals: ActionProposal[];
  summary: PlanSummary;
}

export interface ExecuteRequest {
  plan_id: string;
  approved_by: string;
  include: Array<"auto" | "needs_approval">;
}

export interface ExecuteResult {
  executed: number;
  skipped_duplicate: number;
  failed: number;
  audit_ids: string[];
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: ActionType;
  user_id: string;
  incident_id: string;
  params: Record<string, unknown>;
  result: "ok" | "skipped_duplicate" | "failed";
  reversible: boolean;
  rolled_back: boolean;
}
