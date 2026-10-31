import type { PolicyDecision } from "./types";

// display mirror of backend/policies.yaml (PLAN T08) - the backend stays the source of truth
export const POLICY_TABLE: Array<{ action: string; decision: PolicyDecision; condition: string }> = [
  { action: "send_message", decision: "auto", condition: "always" },
  { action: "reschedule_lesson", decision: "auto", condition: "always" },
  { action: "grant_free_lesson", decision: "auto", condition: "lessons ≤ 1" },
  { action: "refund", decision: "needs_approval", condition: "always" },
  { action: "any money action", decision: "needs_approval", condition: "bulk plan with more than 20 users" },
  { action: "unknown action", decision: "forbidden", condition: "not listed in policy" },
];
