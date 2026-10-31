"use client";

import type { ReactNode } from "react";
import type { Evidence, PolicyDecision, TicketStatus, Verdict } from "@/lib/types";
import { useCountUp } from "@/lib/motion";
import { pct } from "@/lib/format";

export const ABSTAIN_THRESHOLD = 0.6;

// small quiet section label (sentence case, no pills)
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-[13px] font-medium text-mute ${className}`}>{children}</h3>;
}

export function Heading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={`text-[clamp(34px,5vw,60px)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink ${className}`}>
      {children}
    </h1>
  );
}

export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value);
  return <>{format ? format(v) : Math.round(v)}</>;
}

// big mono figure used for the hero numbers
export function Figure({ children, tone = "text-ink" }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`font-mono text-[clamp(44px,7vw,96px)] font-medium leading-none tracking-[-0.05em] tabular-nums ${tone}`}>
      {children}
    </span>
  );
}

const VERDICT_DOT: Record<Verdict, string> = {
  bug: "bg-signal",
  user_error: "bg-ink",
  request: "bg-mute",
  unclear: "border border-faint",
};

export function VerdictMark({ verdict, large = false }: { verdict: Verdict; large?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-ink ${large ? "text-xl font-medium tracking-tight" : "text-[13px]"}`}>
      <span className={`inline-block size-2 rounded-full ${VERDICT_DOT[verdict]}`} />
      {verdict.replace("_", " ")}
    </span>
  );
}

export const POLICY_BAR: Record<PolicyDecision, string> = {
  auto: "bg-safe",
  needs_approval: "bg-warn",
  forbidden: "bg-signal",
};

export const POLICY_LABEL: Record<PolicyDecision, string> = {
  auto: "Auto",
  needs_approval: "Needs approval",
  forbidden: "Forbidden",
};

const STATUS_COPY: Record<TicketStatus, string> = {
  new: "new",
  triaged: "triaged",
  in_incident: "in incident",
  resolved: "resolved",
  needs_human: "needs human",
};

export function StatusText({ status }: { status: TicketStatus }) {
  const tone = status === "in_incident" ? "text-signal" : status === "needs_human" ? "text-ink" : "text-faint";
  return <span className={`text-[13px] ${tone}`}>{STATUS_COPY[status]}</span>;
}

// thin bar with the abstain threshold marked; value in mono
export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] text-mute">Confidence</span>
        <span className="font-mono text-sm tabular-nums text-ink">{pct(value)}</span>
      </div>
      <div
        className="relative h-[2px] bg-line"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-label="triage confidence"
      >
        <div className={`h-full ${value < ABSTAIN_THRESHOLD ? "bg-mute" : "bg-ink"}`} style={{ width: pct(value) }} />
        <div className="absolute -top-[5px] h-3 w-px bg-faint" style={{ left: pct(ABSTAIN_THRESHOLD) }} />
      </div>
      <div className="mt-2 text-[11px] text-faint" style={{ marginLeft: `calc(${pct(ABSTAIN_THRESHOLD)} - 30px)` }}>
        abstains below {pct(ABSTAIN_THRESHOLD)}
      </div>
    </div>
  );
}

// evidence as a log line: mono, quiet, with a left border
export function EvidenceLine({ evidence }: { evidence: Evidence }) {
  const isLog = evidence.type === "log";
  return (
    <li className={`border-l-2 py-1 pl-4 font-mono text-[12.5px] leading-relaxed ${isLog ? "border-faint" : "border-line"}`}>
      <span className="mr-3 text-faint">{evidence.type}</span>
      <span className="mr-3 text-mute">{evidence.ref}</span>
      <span className="text-ink/90">{evidence.text}</span>
    </li>
  );
}

export function Notice({ tone, children }: { tone: "signal" | "neutral"; children: ReactNode }) {
  return (
    <div className={`border-l-[3px] py-1 pl-4 text-[15px] leading-relaxed text-ink ${tone === "signal" ? "border-signal" : "border-faint"}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "solid",
  className = "",
  ...rest
}: { variant?: "solid" | "ghost"; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles =
    variant === "solid"
      ? "bg-ink text-bg hover:bg-white active:translate-y-px px-4 py-2 font-medium"
      : "text-mute hover:text-ink px-2 py-2";
  return (
    <button {...rest} className={`text-sm disabled:opacity-40 ${styles} ${className}`}>
      {children}
    </button>
  );
}
