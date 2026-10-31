import type { ReactNode } from "react";
import type { Evidence, PolicyDecision, TicketStatus, Verdict } from "@/lib/types";
import { pct } from "@/lib/format";

export const ABSTAIN_THRESHOLD = 0.6;

export function Badge({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  bug: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  user_error: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  request: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  unclear: "border-zinc-600 bg-zinc-800 text-zinc-300",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <Badge className={VERDICT_STYLE[verdict]}>{verdict.replace("_", " ")}</Badge>;
}

const POLICY_STYLE: Record<PolicyDecision, string> = {
  auto: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  needs_approval: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  forbidden: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};
const POLICY_ICON: Record<PolicyDecision, string> = { auto: "✓", needs_approval: "◐", forbidden: "✕" };

export function PolicyBadge({ decision, rule }: { decision: PolicyDecision; rule?: string }) {
  return (
    <Badge className={POLICY_STYLE[decision]}>
      <span aria-hidden>{POLICY_ICON[decision]}</span>
      {decision.replace("_", " ")}
      {rule && <span className="font-mono normal-case tracking-normal opacity-70">· {rule}</span>}
    </Badge>
  );
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  new: "text-zinc-400",
  triaged: "text-emerald-400",
  in_incident: "text-rose-400",
  resolved: "text-zinc-500",
  needs_human: "text-amber-400",
};

export function StatusDot({ status }: { status: TicketStatus }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs ${STATUS_STYLE[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status.replace("_", " ")}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const tone =
    value < ABSTAIN_THRESHOLD ? "bg-rose-500" : value < 0.8 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">Confidence</span>
        <span className="font-mono text-sm font-semibold text-zinc-100">{pct(value)}</span>
      </div>
      <div
        className="relative h-2 rounded-full bg-zinc-800"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-label="triage confidence"
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: pct(value) }} />
        <div
          className="absolute -top-1 h-4 w-px bg-zinc-400"
          style={{ left: pct(ABSTAIN_THRESHOLD) }}
          title={`abstain below ${pct(ABSTAIN_THRESHOLD)}`}
        />
      </div>
      <div className="mt-1 text-[10px] text-zinc-500" style={{ marginLeft: `calc(${pct(ABSTAIN_THRESHOLD)} - 36px)` }}>
        abstain below {pct(ABSTAIN_THRESHOLD)}
      </div>
    </div>
  );
}

export function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const isLog = evidence.type === "log";
  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
            isLog ? "bg-amber-400/15 text-amber-300" : "bg-sky-400/15 text-sky-300"
          }`}
        >
          {evidence.type.toUpperCase()}
        </span>
        <span className="truncate font-mono text-xs text-zinc-300" title={evidence.ref}>
          {evidence.ref}
        </span>
      </div>
      <p className={`text-sm text-zinc-400 ${isLog ? "font-mono text-xs" : ""}`}>{evidence.text}</p>
    </li>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{children}</h3>;
}
