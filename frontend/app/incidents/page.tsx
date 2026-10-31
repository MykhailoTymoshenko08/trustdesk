"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, Card, PolicyBadge, SectionTitle, VerdictBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { timeUtc, usd } from "@/lib/format";
import type {
  ActionProposal,
  ExecuteResult,
  Incident,
  IncidentDetail,
  Plan,
  PolicyDecision,
} from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const LIVE_WINDOW_MS = 6000;
const APPROVER = "support.lead";
const DECISIONS: PolicyDecision[] = ["auto", "needs_approval", "forbidden"];

const DECISION_COPY: Record<PolicyDecision, { title: string; hint: string }> = {
  auto: { title: "Auto", hint: "Within policy - runs without a human." },
  needs_approval: { title: "Needs approval", hint: "Money or bulk action - a human must approve." },
  forbidden: { title: "Forbidden", hint: "Blocked by policy. Never executed." },
};

// true for a few seconds after the value changes - drives the LIVE indicator
function useRecentlyChanged(value: number | undefined): boolean {
  const [live, setLive] = useState(false);
  const prev = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (prev.current !== undefined && value !== prev.current) {
      const on = setTimeout(() => setLive(true), 0);
      const off = setTimeout(() => setLive(false), LIVE_WINDOW_MS);
      prev.current = value;
      return () => {
        clearTimeout(on);
        clearTimeout(off);
      };
    }
    prev.current = value;
  }, [value]);
  return live;
}

function LiveCounter({ value, live }: { value: number; live: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span key={value} className="animate-pulse font-mono text-5xl font-semibold tabular-nums text-zinc-50">
        {value}
      </span>
      <div className="text-sm leading-tight text-zinc-400">
        tickets
        <br />
        reported
      </div>
      {live && (
        <Badge className="border-rose-500/40 bg-rose-500/10 text-rose-300">
          <span className="size-1.5 animate-ping rounded-full bg-rose-400" />
          live
        </Badge>
      )}
    </div>
  );
}

function ImpactCard({ label, value, hint, tone = "text-zinc-50" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`font-mono text-3xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </Card>
  );
}

function ImpactCards({ incident }: { incident: Incident }) {
  const i = incident.impact;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <ImpactCard label="Affected families" value={String(i.affected_users)} hint={`${i.missed_lessons} missed lessons`} />
      <ImpactCard
        label="Silent"
        value={String(i.silent_users)}
        hint="affected but haven't written yet"
        tone="text-amber-300"
      />
      <ImpactCard label="Reported" value={String(i.reporting_users)} hint="opened a ticket" />
      <ImpactCard
        label="$ at risk"
        value={usd(i.money_at_risk_cents)}
        tone="text-rose-300"
        hint={`${usd(i.breakdown.missed_lessons_value_cents)} lessons + ${usd(i.breakdown.renewals_at_risk_cents)} renewals`}
      />
    </div>
  );
}

const ACTION_LABEL: Record<ActionProposal["action"], string> = {
  send_message: "Send message",
  grant_free_lesson: "Grant free lesson",
  reschedule_lesson: "Reschedule lesson",
  refund: "Refund",
};

function describeParams(p: ActionProposal): string {
  if (typeof p.params.text === "string") return p.params.text;
  if (typeof p.params.amount_cents === "number") return usd(p.params.amount_cents);
  if (typeof p.params.lessons === "number") return `${p.params.lessons} lesson`;
  return "";
}

function DecisionGroup({ decision, rows, namesById }: { decision: PolicyDecision; rows: ActionProposal[]; namesById: Map<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 5);
  const rules = Array.from(new Set(rows.map((r) => r.policy.rule)));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <PolicyBadge decision={decision} />
          <span className="font-mono text-lg font-semibold tabular-nums text-zinc-100">{rows.length}</span>
          <span className="text-sm text-zinc-500">{DECISION_COPY[decision].hint}</span>
        </div>
        <span className="font-mono text-[11px] text-zinc-500">{rules.join(" · ")}</span>
      </div>
      <div className="divide-y divide-zinc-800/70">
        {visible.map((r) => (
          <div key={r.idempotency_key} className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[150px_150px_1fr]">
            <span className="text-zinc-200">{ACTION_LABEL[r.action]}</span>
            <span className="text-zinc-400">
              {namesById.has(r.user_id) && <>{namesById.get(r.user_id)} </>}
              <span className="font-mono text-[11px] text-zinc-600">{r.user_id}</span>
            </span>
            <span className="col-span-2 truncate text-zinc-500 sm:col-span-1" title={describeParams(r)}>
              {describeParams(r) || r.reason}
            </span>
          </div>
        ))}
      </div>
      {rows.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-zinc-800 px-4 py-2 text-left text-xs text-zinc-400 hover:text-zinc-100"
        >
          {expanded ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
    </Card>
  );
}

function ResolutionPanel({ detail, onExecuted }: { detail: IncidentDetail; onExecuted: () => void }) {
  const incidentId = detail.incident.id;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [includeApproval, setIncludeApproval] = useState(true);
  const [busy, setBusy] = useState<"plan" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const namesById = new Map<string, string>([
    ...detail.tickets.map((t) => [t.user_id, t.user_name] as const),
    ...detail.silent_users.map((u) => [u.id, u.name] as const),
  ]);

  async function createPlan() {
    setBusy("plan");
    setError(null);
    setResult(null);
    try {
      setPlan(await api.plan(incidentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not build plan");
    } finally {
      setBusy(null);
    }
  }

  async function execute() {
    if (!plan) return;
    setBusy("execute");
    setError(null);
    try {
      const include: Array<"auto" | "needs_approval"> = includeApproval ? ["auto", "needs_approval"] : ["auto"];
      setResult(await api.execute(incidentId, { plan_id: plan.plan_id, approved_by: APPROVER, include }));
      onExecuted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "execution failed");
    } finally {
      setBusy(null);
    }
  }

  const runnable = plan ? plan.summary.auto + (includeApproval ? plan.summary.needs_approval : 0) : 0;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <SectionTitle>Resolution</SectionTitle>
        <button
          onClick={createPlan}
          disabled={busy !== null}
          className="rounded-md bg-zinc-100 px-3.5 py-1.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-white disabled:opacity-50"
        >
          {busy === "plan" ? "Building plan…" : plan ? "Rebuild plan" : "Plan resolution"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

      {!plan && (
        <Card className="p-6 text-sm text-zinc-500">
          Build a dry-run plan: the agent proposes, the policy engine decides, nothing runs until you approve.
        </Card>
      )}

      {plan && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-300">
            <Badge className="border-zinc-600 text-zinc-300">dry run</Badge>
            Nothing has been executed.
            <span className="text-zinc-500">
              {plan.proposals.length} proposed actions for {new Set(plan.proposals.filter((p) => p.policy.decision !== "forbidden").map((p) => p.user_id)).size} families.
            </span>
          </div>

          {DECISIONS.map((d) => {
            const rows = plan.proposals.filter((p) => p.policy.decision === d);
            return rows.length > 0 ? <DecisionGroup key={d} decision={d} rows={rows} namesById={namesById} /> : null;
          })}

          <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includeApproval}
                onChange={(e) => setIncludeApproval(e.target.checked)}
                className="size-4 accent-emerald-400"
              />
              Also approve {plan.summary.needs_approval} action{plan.summary.needs_approval === 1 ? "" : "s"} needing approval
            </label>
            <button
              onClick={execute}
              disabled={busy !== null || runnable === 0}
              className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:opacity-50"
            >
              {busy === "execute" ? "Executing…" : `Approve & execute (${runnable})`}
            </button>
          </Card>

          {result && (
            <Card className="grid grid-cols-3 divide-x divide-zinc-800 text-center">
              <ResultCell label="Executed" value={result.executed} tone="text-emerald-300" />
              <ResultCell label="Skipped duplicates" value={result.skipped_duplicate} tone="text-zinc-100" />
              <ResultCell label="Failed" value={result.failed} tone={result.failed ? "text-rose-300" : "text-zinc-100"} />
              <p className="col-span-3 border-t border-zinc-800 px-4 py-2.5 text-xs text-zinc-500">
                {result.skipped_duplicate > 0 && result.executed === 0
                  ? "Idempotency keys blocked every repeat - nobody was compensated twice. "
                  : ""}
                {result.audit_ids.length} audit entries written.{" "}
                <Link href="/audit" className="text-zinc-300 underline underline-offset-2 hover:text-white">
                  View audit log →
                </Link>
              </p>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}

function ResultCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="p-4">
      <div className={`font-mono text-3xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-widest text-zinc-500">{label}</div>
    </div>
  );
}

function IncidentView({ incidentId }: { incidentId: string }) {
  const { data: detail, reload } = usePolling(() => api.incident(incidentId));
  const live = useRecentlyChanged(detail?.incident.ticket_count);
  const [showSilent, setShowSilent] = useState(false);

  if (!detail) return <p className="text-sm text-zinc-500">Loading incident…</p>;
  const { incident } = detail;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className="border-rose-500/30 bg-rose-500/10 text-rose-300">{incident.status}</Badge>
            <span className="font-mono text-xs text-zinc-500">{incident.id}</span>
            <span className="font-mono text-xs text-zinc-500">{incident.feature}</span>
          </div>
          <h2 className="mb-3 text-2xl font-semibold tracking-tight text-zinc-50">{incident.title}</h2>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-amber-400/30 bg-amber-400/10 font-mono text-amber-300">{incident.signal.error_code}</Badge>
            <Badge className="border-zinc-700 font-mono text-zinc-300">{incident.signal.release}</Badge>
            <Badge className="border-zinc-700 text-zinc-400">
              first seen {timeUtc(incident.first_seen)} UTC
            </Badge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <LiveCounter value={incident.ticket_count} live={live} />
          <Link href="/devcard" className="text-sm text-zinc-400 underline underline-offset-2 hover:text-zinc-100">
            Open dev card →
          </Link>
        </div>
      </div>

      <ImpactCards incident={incident} />

      <ResolutionPanel detail={detail} onExecuted={reload} />

      <section>
        <SectionTitle>Tickets in this incident ({detail.tickets.length})</SectionTitle>
        <Card className="divide-y divide-zinc-800/70">
          {detail.tickets.map((t) => (
            <div key={t.id} className="flex items-start gap-4 px-4 py-3">
              <span className="w-28 shrink-0 text-sm font-medium text-zinc-200">{t.user_name}</span>
              <p className="flex-1 text-sm text-zinc-400">{t.text}</p>
              {t.triage && (
                <div className="flex shrink-0 items-center gap-2">
                  <VerdictBadge verdict={t.triage.verdict} />
                  <span className="font-mono text-xs text-zinc-500">{Math.round(t.triage.confidence * 100)}%</span>
                </div>
              )}
            </div>
          ))}
        </Card>
      </section>

      <section>
        <button onClick={() => setShowSilent((v) => !v)} className="mb-2 flex items-center gap-2">
          <SectionTitle>
            Silent users ({detail.silent_users.length}) {showSilent ? "▾" : "▸"}
          </SectionTitle>
        </button>
        {showSilent && (
          <Card className="grid gap-x-6 divide-y divide-zinc-800/70 sm:grid-cols-2 sm:divide-y-0">
            {detail.silent_users.map((u) => (
              <div key={u.id} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-zinc-300">{u.name}</span>
                <span className="font-mono text-xs text-zinc-500">last error {timeUtc(u.last_error_at)} UTC</span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

export default function IncidentsPage() {
  const { data: incidents, error } = usePolling(() => api.incidents());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = incidents?.find((i) => i.id === selectedId) ?? incidents?.[0] ?? null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Incidents</h1>
        <p className="text-sm text-zinc-500">Tickets grouped by root cause, with the real cost of the bug.</p>
        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      </div>

      {incidents && incidents.length === 0 && (
        <Card className="p-10 text-center">
          <p className="text-zinc-300">All quiet - no open incidents.</p>
          <p className="mt-1 text-sm text-zinc-500">Press “Simulate release v2.14” to watch one form.</p>
        </Card>
      )}

      {incidents && incidents.length > 1 && (
        <div className="mb-6 flex gap-2">
          {incidents.map((i) => (
            <button
              key={i.id}
              onClick={() => setSelectedId(i.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${i.id === selected?.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
            >
              {i.title}
            </button>
          ))}
        </div>
      )}

      {selected && <IncidentView key={selected.id} incidentId={selected.id} />}
    </div>
  );
}
