"use client";

import { Card, PolicyBadge, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { pct } from "@/lib/format";
import { POLICY_TABLE } from "@/lib/policy";
import { usePolling } from "@/lib/usePolling";

function Metric({ label, value, hint, tone = "text-zinc-50" }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`font-mono text-3xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{hint}</div>
    </Card>
  );
}

export default function TrustPage() {
  const { data: ev, error } = usePolling(() => api.eval(), 10_000);
  const { data: m } = usePolling(() => api.metrics(), 4000);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Trust</h1>
        <p className="max-w-2xl text-sm text-zinc-500">
          The agent proposes. A deterministic policy decides. Every action is idempotent, audited and reversible.
          Accuracy is measured on a labeled set - not claimed.
        </p>
        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      </div>

      <section>
        <SectionTitle>Measured accuracy {ev && ev.n > 0 ? `(${ev.n} labeled tickets)` : ""}</SectionTitle>
        {ev && ev.n === 0 && (
          <p className="mb-3 text-sm text-amber-300">
            No eval run yet - run <span className="font-mono">eval/run_eval.py</span> in backend/ to measure accuracy.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric label="Triage accuracy" value={ev && ev.n > 0 ? pct(ev.triage_accuracy) : "-"} hint="feature + verdict correct" tone="text-emerald-300" />
          <Metric label="Verdict F1" value={ev && ev.n > 0 ? pct(ev.verdict_f1) : "-"} hint="bug / user error / request" />
          <Metric label="Grouping precision" value={ev && ev.n > 0 ? pct(ev.grouping_precision) : "-"} hint="no unrelated tickets in incidents" />
          <Metric label="Grouping recall" value={ev && ev.n > 0 ? pct(ev.grouping_recall) : "-"} hint="incident tickets found" />
          <Metric label="Abstain rate" value={ev && ev.n > 0 ? pct(ev.abstain_rate) : "-"} hint="handed to a human instead of guessing" tone="text-amber-300" />
          <Metric label="Injection blocked" value={ev && ev.n > 0 ? pct(ev.injection_blocked) : "-"} hint="attempts that triggered no action" tone="text-emerald-300" />
        </div>
      </section>

      <section>
        <SectionTitle>Live</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Tickets" value={m ? String(m.tickets_total) : "-"} hint="in the inbox" />
          <Metric label="Auto-resolved" value={m ? `${Math.round(m.auto_resolved_pct)}%` : "-"} hint="decided without a human" />
          <Metric label="Time saved" value={m ? `${m.avg_handle_time_saved_min} min` : "-"} hint="avg per ticket" />
          <Metric label="Open incidents" value={m ? String(m.incidents_open) : "-"} hint="grouped by root cause" tone="text-rose-300" />
        </div>
      </section>

      <section>
        <SectionTitle>Policy - what the agent may do</SectionTitle>
        <Card className="divide-y divide-zinc-800/70">
          {POLICY_TABLE.map((r) => (
            <div key={`${r.action}:${r.condition}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[200px_1fr_auto]">
              <span className="font-mono text-sm text-zinc-100">{r.action}</span>
              <span className="order-3 col-span-2 text-sm text-zinc-500 sm:order-none sm:col-span-1">{r.condition}</span>
              <PolicyBadge decision={r.decision} />
            </div>
          ))}
        </Card>
        <p className="mt-2 text-xs text-zinc-600">AI never executes actions: it proposes, the policy engine decides, the executor runs and logs.</p>
      </section>
    </div>
  );
}
