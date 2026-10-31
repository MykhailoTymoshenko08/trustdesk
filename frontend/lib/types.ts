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
  skipped_policy: number; // forbidden or not in `include` (added to PLAN section 3 by backend)
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

export interface EntryPoint {
  app: string;
  path: string;
  symbol: string;
  route?: string | null;
}

export interface DevCard {
  feature: string;
  entry_points: EntryPoint[];
  repro_steps: string[];
  release: string;
  impact: Impact;
  markdown: string;
}

export interface EvalReport {
  triage_accuracy: number;
  verdict_f1: number;
  grouping_precision: number;
  grouping_recall: number;
  abstain_rate: number;
  injection_blocked: number;
  n: number;
}

// auto_resolved_pct is 0-100 (not a 0-1 ratio); contract leaves the scale open
export interface Metrics {
  tickets_total: number;
  auto_resolved_pct: number;
  avg_handle_time_saved_min: number;
  incidents_open: number;
}

export interface NewTicket {
  user_id: string;
  text: string;
  channel: string;
}

// QA of human agent replies - proposed shape, not yet in PLAN section 3 (backend S1 pending)
// scores are 0-100 integers
export interface QaItem {
  id: string;
  ticket_id: string | null;
  agent: string;
  reply: string;
  score: number;
  scores: { accuracy: number; empathy: number; resolved: boolean };
  issues: string[];
  better_reply: string;
  created_at: string;
}

export interface QaScoreRequest {
  ticket_id: string | null;
  reply: string;
}

// GET /incidents/{id}/gotcha - proposed shape (S2): a unified diff for known-gotchas.md
export interface Gotcha {
  feature: string;
  file: string;
  diff: string;
}

// data plus a flag set when the backend endpoint was missing and sample data was used
export interface Sourced<T> {
  data: T;
  mocked: boolean;
}
