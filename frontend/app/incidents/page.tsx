"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  CountUp,
  Figure,
  Heading,
  Label,
  POLICY_BAR,
  POLICY_LABEL,
  VerdictMark,
} from "@/components/ui";
import { api } from "@/lib/api";
import { timeUtc, usd } from "@/lib/format";
import { stagger } from "@/lib/motion";
import type { ActionProposal, ExecuteResult, Gotcha, Incident, IncidentDetail, Plan, PolicyDecision } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const LIVE_WINDOW_MS = 6000;
const APPROVER = "support.lead";
const DECISIONS: PolicyDecision[] = ["auto", "needs_approval", "forbidden"];
const HINT: Record<PolicyDecision, string> = {
  auto: "Within policy. Runs without a human.",
  needs_approval: "Money or bulk action. A human must approve.",
  forbidden: "Blocked by policy. Never executed.",
};

// true for a few seconds after the value changes - drives the live indicator
function useRecentlyChanged(value: number | undefined): boolean {
  const [live, setLive] = useState(false);
  const prev = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (prev.current !== undefined && value !== prev.current) {
      prev.current = value;
      const on = setTimeout(() => setLive(true), 0);
      const off = setTimeout(() => setLive(false), LIVE_WINDOW_MS);
      return () => {
        clearTimeout(on);
        clearTimeout(off);
      };
    }
    prev.current = value;
  }, [value]);
  return live;
}

function Hero({ incident, live }: { incident: Incident; live: boolean }) {
  const i = incident.impact;
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[12px] text-mute">
        <span className="flex items-center gap-2 text-signal">
          <span className={`size-1.5 rounded-full bg-signal ${live ? "live-dot" : ""}`} />
          {incident.status}
        </span>
        <span>{incident.id}</span>
        <span>{incident.feature}</span>
        <span className="text-ink">{incident.signal.error_code}</span>
        <span>{incident.signal.release}</span>
        <span>first seen {timeUtc(incident.first_seen)} UTC</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
        <Heading className="max-w-3xl">{incident.title}</Heading>
        <div className="flex items-baseline gap-3 pb-1">
          <span className="font-mono text-[44px] font-medium leading-none tracking-[-0.05em] tabular-nums text-ink">
            <CountUp value={incident.ticket_count} />
          </span>
          <span className="text-sm leading-tight text-mute">
            tickets
            <br />
            reported
          </span>
        </div>
      </div>

      <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-3">
        <div>
          <Figure>
            <CountUp value={i.affected_users} />
          </Figure>
          <p className="mt-3 text-[15px] text-mute">families affected</p>
        </div>
        <div>
          <Figure>
            <CountUp value={i.silent_users} />
          </Figure>
          <p className="mt-3 text-[15px] text-mute">silent, haven&apos;t written yet</p>
        </div>
        <div>
          <Figure tone="text-signal">
            <CountUp value={i.money_at_risk_cents / 100} format={(n) => `$${Math.round(n).toLocaleString("en-US")}`} />
          </Figure>
          <p className="mt-3 text-[15px] text-mute">at risk</p>
        </div>
      </div>

      <p className="mt-8 font-mono text-[12.5px] text-mute">
        {i.missed_lessons} missed lessons ({usd(i.breakdown.missed_lessons_value_cents)}) · {usd(i.breakdown.renewals_at_risk_cents)} renewals at risk ·{" "}
        {i.reporting_users} families reported
      </p>
    </section>
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
  return p.reason;
}

function DecisionGroup({ decision, rows, namesById }: { decision: PolicyDecision; rows: ActionProposal[]; namesById: Map<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 5);
  const rules = Array.from(new Set(rows.map((r) => r.policy.rule)));
  return (
    <div className="flex gap-5">
      <div className={`w-[3px] shrink-0 ${POLICY_BAR[decision]}`} />
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-lg font-medium tracking-tight text-ink">{POLICY_LABEL[decision]}</span>
          <span className="font-mono text-lg tabular-nums text-ink">{rows.length}</span>
          <span className="text-sm text-mute">{HINT[decision]}</span>
          <span className="ml-auto font-mono text-[11px] text-faint">{rules.join(" · ")}</span>
        </div>
        <div>
          {visible.map((r, n) => (
            <div
              key={r.idempotency_key}
              style={stagger(n, 24)}
              className="rise grid grid-cols-[150px_1fr] gap-x-6 gap-y-0.5 border-t border-line py-2.5 text-sm sm:grid-cols-[160px_150px_1fr]"
            >
              <span className="text-ink">{ACTION_LABEL[r.action]}</span>
              <span className="text-mute">
                {namesById.get(r.user_id) ?? ""} <span className="font-mono text-[11px] text-faint">{r.user_id}</span>
              </span>
              <span className="col-span-2 truncate text-mute sm:col-span-1" title={describeParams(r)}>
                {describeParams(r)}
              </span>
            </div>
          ))}
        </div>
        {rows.length > 5 && (
          <button onClick={() => setExpanded((v) => !v)} className="mt-2 border-t border-line pt-3 text-sm text-mute hover:text-ink">
            {expanded ? "Show less" : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

function ResultCell({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <div className={`font-mono text-[40px] font-medium leading-none tracking-[-0.04em] tabular-nums ${strong ? "text-safe" : "text-ink"}`}>
        <CountUp value={value} />
      </div>
      <div className="mt-2 text-[13px] text-mute">{label}</div>
    </div>
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
  const families = plan ? new Set(plan.proposals.filter((p) => p.policy.decision !== "forbidden").map((p) => p.user_id)).size : 0;

  return (
    <section className="mt-24">
      <div className="flex items-end justify-between gap-6 border-b border-line pb-4">
        <div>
          <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-ink">Resolution</h2>
          <p className="mt-1 text-[15px] text-mute">The agent proposes. Policy decides. Nothing runs until you approve.</p>
        </div>
        <Button onClick={createPlan} disabled={busy !== null}>
          {busy === "plan" ? "Building plan…" : plan ? "Rebuild plan" : "Plan resolution"}
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-signal">{error}</p>}

      {plan && (
        <div className="mt-8 space-y-10">
          <p className="font-mono text-[12.5px] text-mute">
            dry run · {plan.proposals.length} proposed actions for {families} families · nothing executed
          </p>

          {DECISIONS.map((d) => {
            const rows = plan.proposals.filter((p) => p.policy.decision === d);
            return rows.length > 0 ? <DecisionGroup key={d} decision={d} rows={rows} namesById={namesById} /> : null;
          })}

          <div className="flex flex-wrap items-center justify-between gap-6 border-t border-line pt-6">
            <label className="flex items-center gap-3 text-[15px] text-ink">
              <input
                type="checkbox"
                checked={includeApproval}
                onChange={(e) => setIncludeApproval(e.target.checked)}
                className="size-4 accent-[#eceef2]"
              />
              Also approve {plan.summary.needs_approval} action{plan.summary.needs_approval === 1 ? "" : "s"} needing approval
            </label>
            <Button onClick={execute} disabled={busy !== null || runnable === 0} className="px-6 py-3 text-base">
              {busy === "execute" ? "Executing…" : `Approve & execute (${runnable})`}
            </Button>
          </div>

          {result && (
            <div className="rise border-t border-line pt-8">
              <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
                <ResultCell label="Executed" value={result.executed} strong={result.executed > 0} />
                <ResultCell label="Skipped duplicates" value={result.skipped_duplicate} />
                <ResultCell label="Blocked by policy" value={result.skipped_policy} />
                <ResultCell label="Failed" value={result.failed} />
              </div>
              <p className="mt-6 text-[14px] text-mute">
                {result.skipped_duplicate > 0 && result.executed === 0
                  ? "Idempotency keys blocked every repeat. Nobody was compensated twice. "
                  : ""}
                {result.audit_ids.length} audit entries written.{" "}
                <Link href="/audit" className="text-ink underline underline-offset-4">
                  View audit log
                </Link>
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function diffLineTone(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) return "text-faint";
  if (line.startsWith("+")) return "text-safe";
  if (line.startsWith("-")) return "text-signal";
  return "text-mute";
}

// drafts a known-gotchas.md entry for review; nothing is written to the repo
function DocsUpdate({ incidentId }: { incidentId: string }) {
  const [gotcha, setGotcha] = useState<Gotcha | null>(null);
  const [mocked, setMocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.gotcha(incidentId);
      setGotcha(res.data);
      setMocked(res.mocked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not draft docs update");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!gotcha) return;
    try {
      await navigator.clipboard.writeText(gotcha.diff);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mt-24">
      <div className="flex items-end justify-between gap-6 border-b border-line pb-4">
        <div>
          <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-ink">Docs</h2>
          <p className="mt-1 text-[15px] text-mute">Turn this incident into a known-gotchas entry. A diff for review, nothing is written.</p>
        </div>
        <Button onClick={suggest} disabled={busy}>
          {busy ? "Drafting…" : gotcha ? "Redraft" : "Suggest docs update"}
        </Button>
      </div>
      {error && <p className="mt-4 text-sm text-signal">{error}</p>}
      {gotcha && (
        <div className="rise mt-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <span className="font-mono text-[12px] text-mute">
              {gotcha.file}
              {mocked && <span className="ml-4 text-faint">sample data - backend gotcha endpoint not available yet</span>}
            </span>
            <button onClick={copy} className="text-[13px] text-mute underline underline-offset-4 hover:text-ink">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="overflow-x-auto border-l-2 border-faint pl-5 font-mono text-[12.5px] leading-relaxed">
            {gotcha.diff.split("\n").map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap ${diffLineTone(line)}`}>
                {line || " "}
              </div>
            ))}
          </pre>
        </div>
      )}
    </section>
  );
}

function IncidentView({ incidentId }: { incidentId: string }) {
  const { data: detail, reload } = usePolling(() => api.incident(incidentId));
  const live = useRecentlyChanged(detail?.incident.ticket_count);
  const [showSilent, setShowSilent] = useState(false);

  if (!detail) return <p className="text-sm text-mute">Loading incident…</p>;
  const { incident } = detail;

  return (
    <div>
      <Hero incident={incident} live={live} />
      <div className="mt-6">
        <Link href="/devcard" className="text-sm text-mute underline-offset-4 hover:text-ink hover:underline">
          Open dev card
        </Link>
      </div>

      <ResolutionPanel detail={detail} onExecuted={reload} />

      <DocsUpdate incidentId={incident.id} />

      <section className="mt-24">
        <Label className="mb-4">Tickets in this incident ({detail.tickets.length})</Label>
        <div>
          {detail.tickets.map((t, i) => (
            <div key={t.id} style={stagger(i)} className="rise grid grid-cols-[120px_1fr] gap-x-6 border-t border-line py-3.5 sm:grid-cols-[140px_1fr_150px]">
              <span className="text-[15px] font-medium text-ink">{t.user_name}</span>
              <p className="text-[15px] leading-snug text-mute">{t.text}</p>
              {t.triage && (
                <span className="col-span-2 mt-1 flex items-center gap-3 sm:col-span-1 sm:mt-0 sm:justify-end">
                  <VerdictMark verdict={t.triage.verdict} />
                  <span className="font-mono text-xs tabular-nums text-faint">{Math.round(t.triage.confidence * 100)}%</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <button onClick={() => setShowSilent((v) => !v)} className="text-[13px] font-medium text-mute hover:text-ink">
          Silent users ({detail.silent_users.length}) {showSilent ? "−" : "+"}
        </button>
        {showSilent && (
          <div className="mt-4 grid gap-x-12 sm:grid-cols-2">
            {detail.silent_users.map((u, i) => (
              <div key={u.id} style={stagger(i, 12, 300)} className="rise flex justify-between border-t border-line py-2 text-sm">
                <span className="text-ink">{u.name}</span>
                <span className="font-mono text-xs text-faint">last error {timeUtc(u.last_error_at)} UTC</span>
              </div>
            ))}
          </div>
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
      {error && <p className="mb-4 text-sm text-signal">{error}</p>}

      {incidents && incidents.length === 0 && (
        <div className="py-16">
          <Heading>All quiet.</Heading>
          <p className="mt-4 max-w-md text-[17px] text-mute">
            No open incidents. Press &ldquo;Simulate release v2.14&rdquo; to watch one form.
          </p>
        </div>
      )}

      {incidents && incidents.length > 1 && (
        <div className="mb-8 flex gap-6">
          {incidents.map((i) => (
            <button
              key={i.id}
              onClick={() => setSelectedId(i.id)}
              className={`text-sm ${i.id === selected?.id ? "text-ink" : "text-faint hover:text-mute"}`}
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
