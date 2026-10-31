"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Button, CountUp, Heading, Label, VerdictMark } from "@/components/ui";
import { api } from "@/lib/api";
import { pct } from "@/lib/format";
import { stagger } from "@/lib/motion";
import type { QaEntry, QaVerdict, Ticket } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const FLAG_BELOW = 70;

const scoreTone = (n: number): string => (n >= 80 ? "text-safe" : n < 60 ? "text-signal" : "text-ink");
const shorten = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="text-mute">{label}</span>
        <span className="font-mono tabular-nums text-ink">{value}</span>
      </div>
      <div className="h-[2px] bg-line">
        <div className="h-full bg-mute" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button onClick={copy} className="text-[13px] text-mute underline underline-offset-4 hover:text-ink">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ColumnLabel({ n, children }: { n: string; children: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3 text-[13px] font-medium text-mute">
      <span className="font-mono text-faint">{n}</span>
      {children}
    </div>
  );
}

// Question -> Reply -> Score, issues, better reply
function QaFlow({ question, verdictLine, reply, verdict }: { question: string; verdictLine?: Ticket["triage"]; reply: string; verdict: QaVerdict }) {
  return (
    <div className="rise grid gap-x-12 gap-y-10 lg:grid-cols-[1fr_1fr_1.15fr]">
      <div>
        <ColumnLabel n="→">Question</ColumnLabel>
        <p className="text-[19px] font-medium leading-snug tracking-[-0.015em] text-ink">{question}</p>
        {verdictLine && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
            <VerdictMark verdict={verdictLine.verdict} />
            <span className="font-mono text-[12px] text-mute">{verdictLine.feature}</span>
            <span className="font-mono text-[12px] text-faint">{pct(verdictLine.confidence)}</span>
          </div>
        )}
      </div>

      <div>
        <ColumnLabel n="→">Reply</ColumnLabel>
        <p className="border-l-2 border-faint pl-4 text-[15px] leading-relaxed text-ink/90">{reply}</p>
      </div>

      <div>
        <ColumnLabel n="=">Score</ColumnLabel>
        <div className={`font-mono text-[72px] font-medium leading-none tracking-[-0.06em] tabular-nums ${scoreTone(verdict.score)}`}>
          <CountUp value={verdict.score} />
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <Bar label="Accuracy" value={verdict.accuracy} />
          <Bar label="Empathy" value={verdict.empathy} />
          <div>
            <div className="mb-1.5 text-[13px] text-mute">Resolved</div>
            <div className="text-[15px] text-ink">{verdict.resolved ? "yes" : "no"}</div>
          </div>
        </div>

        <div className="mt-8">
          <Label className="mb-3">Issues ({verdict.issues.length})</Label>
          {verdict.issues.length === 0 ? (
            <p className="text-sm text-mute">No issues found.</p>
          ) : (
            <ul className="space-y-2">
              {verdict.issues.map((i) => (
                <li key={i} className="border-l-2 border-signal py-0.5 pl-4 text-[15px] leading-snug text-ink">
                  {i}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <Label>Better reply</Label>
            <CopyButton text={verdict.better_reply} />
          </div>
          <p className="border-l-2 border-safe pl-4 text-[15px] leading-relaxed text-ink/90">{verdict.better_reply}</p>
        </div>
      </div>
    </div>
  );
}

interface Scored {
  ticket: Ticket;
  reply: string;
  verdict: QaVerdict;
}

function Scorer({ tickets, onScored }: { tickets: Ticket[]; onScored: () => void }) {
  const [ticketId, setTicketId] = useState<string>("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Scored | null>(null);

  const ticket = tickets.find((t) => t.id === ticketId) ?? tickets[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.qaScore({ ticket_id: ticket.id, agent_reply: reply.trim() });
      setResult({ ticket, reply: reply.trim(), verdict: data });
      setReply("");
      onScored();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not score reply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <form onSubmit={submit}>
        <Label className="mb-3">1. Pick the ticket the reply answers</Label>
        <select
          value={ticket?.id ?? ""}
          onChange={(e) => {
            setTicketId(e.target.value);
            setResult(null);
          }}
          aria-label="Ticket"
          className="w-full border-b border-line bg-transparent py-2.5 text-[15px] text-ink focus:border-mute focus:outline-none"
        >
          {tickets.map((t) => (
            <option key={t.id} value={t.id} className="bg-bg">
              {t.id} · {t.user_name} · {shorten(t.text, 70)}
            </option>
          ))}
        </select>

        {ticket && (
          <div key={ticket.id} className="rise mt-6 max-w-3xl">
            <p className="text-[clamp(20px,2.2vw,26px)] font-medium leading-[1.25] tracking-[-0.02em] text-ink">{ticket.text}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              {ticket.triage ? (
                <>
                  <VerdictMark verdict={ticket.triage.verdict} />
                  <span className="font-mono text-[12px] text-mute">{ticket.triage.feature}</span>
                  <span className="font-mono text-[12px] text-faint">{pct(ticket.triage.confidence)} confidence</span>
                </>
              ) : (
                <span className="text-[13px] text-mute">not triaged yet</span>
              )}
            </div>
          </div>
        )}

        <Label className="mb-3 mt-10">2. The human agent&apos;s reply</Label>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          placeholder="Paste the reply to check it against the docs and for tone"
          aria-label="Agent reply"
          className="w-full resize-y border-b border-line bg-transparent py-2 text-[17px] leading-relaxed text-ink placeholder:text-faint focus:border-mute focus:outline-none"
        />
        <div className="mt-4 flex items-center gap-4">
          <Button type="submit" disabled={busy || !ticket || !reply.trim()}>
            {busy ? "Scoring…" : "Score reply"}
          </Button>
          {error && <span className="text-sm text-signal">{error}</span>}
        </div>
      </form>

      {result && (
        <div className="mt-14 border-t border-line pt-10">
          <QaFlow question={result.ticket.text} verdictLine={result.ticket.triage} reply={result.reply} verdict={result.verdict} />
        </div>
      )}
    </section>
  );
}

function Row({ entry, index, open, onToggle }: { entry: QaEntry; index: number; open: boolean; onToggle: () => void }) {
  return (
    <div className="rise border-t border-line" style={stagger(index)}>
      <button onClick={onToggle} className="grid w-full grid-cols-[72px_1fr] items-baseline gap-x-6 py-5 text-left sm:grid-cols-[88px_1fr_120px]">
        <span className={`font-mono text-[40px] font-medium leading-none tracking-[-0.05em] tabular-nums ${scoreTone(entry.score)}`}>{entry.score}</span>
        <span className="min-w-0">
          <span className="mb-1 block text-[13px] text-mute">
            {entry.agent}
            <span className="ml-3 font-mono text-faint">{entry.ticket_id}</span>
          </span>
          <span className="block truncate text-[15px] text-mute">{entry.ticket_text}</span>
          <span className="block truncate text-[15px] text-ink">{entry.agent_reply}</span>
        </span>
        <span className="col-span-2 mt-2 text-[13px] text-mute sm:col-span-1 sm:mt-0 sm:text-right">
          {entry.issues.length} issue{entry.issues.length === 1 ? "" : "s"}
        </span>
      </button>
      {open && (
        <div className="pb-10 pt-2">
          <QaFlow question={entry.ticket_text} reply={entry.agent_reply} verdict={entry} />
        </div>
      )}
    </div>
  );
}

export default function QaPage() {
  const { data, error, reload } = usePolling(() => api.qa(), 10_000);
  const { data: tickets } = usePolling(() => api.tickets(), 10_000);
  const [openId, setOpenId] = useState<string | null>(null);

  const entries = data?.data ?? [];
  const open = openId ?? "";
  const avg = entries.length ? entries.reduce((s, i) => s + i.score, 0) / entries.length : null;
  const flagged = entries.filter((i) => i.score < FLAG_BELOW).length;
  const sorted = useMemo(
    () => [...(tickets ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [tickets],
  );

  return (
    <div>
      <Heading>Reply QA</Heading>
      <p className="mt-3 max-w-xl text-[17px] text-mute">
        Human replies scored against the question they answer: accuracy against the docs, tone, and whether the problem is resolved.
      </p>
      {error && <p className="mt-3 text-sm text-signal">{error}</p>}
      {data?.mocked && <p className="mt-3 font-mono text-[12px] text-faint">sample data - backend /qa not available</p>}

      <div className="mt-10 flex flex-wrap gap-x-12 gap-y-4 border-y border-line py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] text-mute">Average score</span>
          <span className="font-mono text-[15px] tabular-nums text-ink">{avg === null ? "—" : <CountUp value={avg} />}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] text-mute">Replies reviewed</span>
          <span className="font-mono text-[15px] tabular-nums text-ink">{entries.length || "—"}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] text-mute">Below {FLAG_BELOW}</span>
          <span className={`font-mono text-[15px] tabular-nums ${flagged > 0 ? "text-signal" : "text-ink"}`}>{entries.length ? flagged : "—"}</span>
        </div>
      </div>

      <Scorer tickets={sorted} onScored={() => void reload()} />

      <div className="mt-24">
        <Label className="mb-3">Reviewed replies</Label>
        {data && entries.length === 0 && <p className="py-8 text-[15px] text-mute">No replies reviewed yet.</p>}
        <div className="border-b border-line">
          {entries.map((entry, i) => (
            <Row key={entry.id} entry={entry} index={i} open={open === entry.id} onToggle={() => setOpenId(open === entry.id ? "" : entry.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
