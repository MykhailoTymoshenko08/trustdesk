"use client";

import { CountUp, Heading, Label, POLICY_BAR, POLICY_LABEL } from "@/components/ui";
import { api } from "@/lib/api";
import { pct } from "@/lib/format";
import { useCountUp } from "@/lib/motion";
import { POLICY_TABLE } from "@/lib/policy";
import { usePolling } from "@/lib/usePolling";
import type { EvalReport } from "@/lib/types";

const dash = "—";

function Ring({ value }: { value: number }) {
  const r = 108;
  const c = 2 * Math.PI * r;
  const v = useCountUp(value * 100) / 100;
  return (
    <svg viewBox="0 0 240 240" className="size-full -rotate-90" aria-hidden>
      <circle cx="120" cy="120" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3" />
      <circle
        cx="120"
        cy="120"
        r={r}
        fill="none"
        stroke="var(--color-safe)"
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v)}
      />
    </svg>
  );
}

function TrustScore({ ev }: { ev: EvalReport | null }) {
  const has = !!ev && ev.n > 0;
  return (
    <div>
      <Label className="mb-6">Trust score</Label>
      <div className="relative aspect-square w-full max-w-[380px]">
        <Ring value={has ? ev.triage_accuracy : 0} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono text-[clamp(72px,9vw,120px)] font-medium leading-none tracking-[-0.06em] tabular-nums text-ink">
            {has ? <CountUp value={ev.triage_accuracy * 100} /> : dash}
            {has && <span className="text-[0.4em] tracking-normal text-mute">%</span>}
          </div>
          <div className="mt-3 text-[15px] text-mute">triage accuracy</div>
        </div>
      </div>
      <p className="mt-6 max-w-sm text-[14px] leading-relaxed text-mute">
        {has
          ? `Feature and verdict correct on ${ev.n} labeled tickets. Measured, not claimed.`
          : "No eval run yet. Run eval/run_eval.py in backend/ to measure accuracy."}
      </p>
    </div>
  );
}

function MetricRow({ label, hint, value, ratio }: { label: string; hint: string; value: string; ratio: number | null }) {
  const v = useCountUp((ratio ?? 0) * 100) / 100;
  return (
    <div className="border-t border-line py-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[15px] text-ink">{label}</div>
          <div className="text-[13px] text-faint">{hint}</div>
        </div>
        <div className="font-mono text-[22px] tabular-nums text-ink">{value}</div>
      </div>
      <div className="mt-3 h-[2px] bg-line">
        <div className="h-full bg-mute" style={{ width: `${(ratio === null ? 0 : v) * 100}%` }} />
      </div>
    </div>
  );
}

export default function TrustPage() {
  const { data: ev, error } = usePolling(() => api.eval(), 10_000);
  const { data: m } = usePolling(() => api.metrics(), 4000);
  const has = !!ev && ev.n > 0;
  const rate = (v: number | undefined) => (has && v !== undefined ? v : null);
  const show = (v: number | undefined) => (has && v !== undefined ? pct(v) : dash);

  const live = [
    { label: "Tickets", value: m && m.tickets_total > 0 ? String(m.tickets_total) : dash },
    { label: "Auto-resolved", value: m && m.auto_resolved_pct > 0 ? `${Math.round(m.auto_resolved_pct)}%` : dash },
    { label: "Time saved", value: m && m.avg_handle_time_saved_min > 0 ? `${m.avg_handle_time_saved_min} min` : dash },
    { label: "Open incidents", value: m && m.incidents_open > 0 ? String(m.incidents_open) : dash },
  ];

  return (
    <div>
      <Heading className="max-w-3xl">An agent you can delegate to.</Heading>
      <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-mute">
        The agent proposes. A deterministic policy decides. Every action is idempotent, audited and reversible.
      </p>
      {error && <p className="mt-3 text-sm text-signal">{error}</p>}

      <div className="mt-10 flex flex-wrap gap-x-12 gap-y-4 border-y border-line py-4">
        {live.map((s) => (
          <div key={s.label} className="flex items-baseline gap-3">
            <span className="text-[13px] text-mute">{s.label}</span>
            <span className="font-mono text-[15px] tabular-nums text-ink">{s.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-20 grid gap-x-20 gap-y-16 lg:grid-cols-[minmax(0,420px)_1fr]">
        <TrustScore ev={ev} />
        <div>
          <Label className="mb-4">Measured on the labeled set</Label>
          <MetricRow label="Verdict F1" hint="bug, user error, request" value={show(ev?.verdict_f1)} ratio={rate(ev?.verdict_f1)} />
          <MetricRow label="Grouping precision" hint="no unrelated tickets in an incident" value={show(ev?.grouping_precision)} ratio={rate(ev?.grouping_precision)} />
          <MetricRow label="Grouping recall" hint="incident tickets found" value={show(ev?.grouping_recall)} ratio={rate(ev?.grouping_recall)} />
          <MetricRow label="Abstain rate" hint="handed to a human instead of guessing" value={show(ev?.abstain_rate)} ratio={rate(ev?.abstain_rate)} />
          <MetricRow label="Injection blocked" hint="attempts that triggered no action" value={show(ev?.injection_blocked)} ratio={rate(ev?.injection_blocked)} />
        </div>
      </div>

      <section className="mt-28">
        <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-ink">The rulebook</h2>
        <p className="mt-1 text-[15px] text-mute">What the agent may do. AI never executes: it proposes, policy decides, the executor runs and logs.</p>
        <div className="mt-8">
          {POLICY_TABLE.map((r) => (
            <div key={`${r.action}:${r.condition}`} className="flex border-t border-line">
              <div className={`w-[3px] shrink-0 ${POLICY_BAR[r.decision]}`} />
              <div className="grid flex-1 grid-cols-[1fr_auto] items-baseline gap-x-8 gap-y-1 py-4 pl-5 sm:grid-cols-[220px_1fr_140px]">
                <span className="font-mono text-[14px] text-ink">{r.action}</span>
                <span className="order-3 col-span-2 text-[15px] text-mute sm:order-none sm:col-span-1">{r.condition}</span>
                <span className="text-right text-[14px] text-ink">{POLICY_LABEL[r.decision]}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
