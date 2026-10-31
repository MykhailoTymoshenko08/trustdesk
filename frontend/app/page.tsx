"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfidenceBar, Card, EvidenceChip, SectionTitle, StatusDot, VerdictBadge, Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { timeUtc } from "@/lib/format";
import type { Ticket } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

type Filter = "all" | "needs_human" | "bug" | "user_error";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_human", label: "Needs human" },
  { id: "bug", label: "Bugs" },
  { id: "user_error", label: "User error" },
];

function matches(t: Ticket, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "needs_human") return t.status === "needs_human";
  return t.triage?.verdict === f;
}

function TicketRow({ ticket, active, onSelect }: { ticket: Ticket; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full border-b border-zinc-800/70 px-4 py-3 text-left transition-colors ${
        active ? "bg-zinc-800/70" : "hover:bg-zinc-900"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-zinc-100">{ticket.user_name}</span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">{timeUtc(ticket.created_at)}</span>
      </div>
      <p className="mb-2 line-clamp-2 text-sm text-zinc-400">{ticket.text}</p>
      <div className="flex flex-wrap items-center gap-2">
        {ticket.triage && <VerdictBadge verdict={ticket.triage.verdict} />}
        {ticket.triage?.injection_detected && (
          <Badge className="border-rose-500/40 bg-rose-500/10 text-rose-300">injection</Badge>
        )}
        <StatusDot status={ticket.status} />
      </div>
    </button>
  );
}

function TicketPanel({ ticket }: { ticket: Ticket }) {
  const triage = ticket.triage;
  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span className="font-mono">{ticket.id}</span>
          <span>{ticket.user_name}</span>
          <span>{ticket.channel}</span>
          <span className="font-mono">{timeUtc(ticket.created_at)} UTC</span>
          <StatusDot status={ticket.status} />
        </div>
        <blockquote className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-[15px] leading-relaxed text-zinc-100">
          {ticket.text}
        </blockquote>
      </div>

      {!triage && <p className="text-sm text-zinc-500">Waiting for triage…</p>}

      {triage && (
        <>
          {triage.injection_detected && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              <strong className="font-semibold">Prompt injection detected.</strong> The message is treated as data only.
              No action is taken automatically, and money actions on this ticket are forbidden by policy.
            </div>
          )}
          {triage.abstained && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <Badge className="border-amber-500/40 text-amber-300">needs human</Badge>
              The agent is not confident enough and handed this ticket over instead of guessing.
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <SectionTitle>Verdict</SectionTitle>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={triage.verdict} />
                <span className="font-mono text-xs text-zinc-400">{triage.feature}</span>
              </div>
              <p className="font-mono text-xs text-zinc-500">{triage.intent}</p>
            </div>
            <ConfidenceBar value={triage.confidence} />
          </div>

          <div>
            <SectionTitle>Evidence ({triage.evidence.length})</SectionTitle>
            {triage.evidence.length === 0 ? (
              <p className="text-sm text-zinc-500">No verified evidence - the agent will not decide without it.</p>
            ) : (
              <ul className="grid gap-2">
                {triage.evidence.map((e) => (
                  <EvidenceChip key={e.ref} evidence={e} />
                ))}
              </ul>
            )}
          </div>

          <div>
            <SectionTitle>Suggested reply</SectionTitle>
            {triage.suggested_reply ? (
              <Card className="p-4 text-sm leading-relaxed text-zinc-300">{triage.suggested_reply}</Card>
            ) : (
              <p className="text-sm text-zinc-500">No reply drafted - a human should answer this one.</p>
            )}
          </div>
        </>
      )}

      {ticket.incident_id && (
        <Link
          href="/incidents"
          className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/15"
        >
          Part of incident <span className="font-mono">{ticket.incident_id}</span> →
        </Link>
      )}
    </div>
  );
}

export default function InboxPage() {
  const { data, error } = usePolling(() => api.tickets());
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tickets = useMemo(
    () =>
      (data ?? [])
        .filter((t) => matches(t, filter))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [data, filter],
  );
  const selected = tickets.find((t) => t.id === selectedId) ?? tickets[0] ?? null;

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Inbox</h1>
          <p className="text-sm text-zinc-500">Every decision shows its evidence, confidence and policy.</p>
        </div>
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>

      <Card className="grid min-h-[70vh] overflow-hidden lg:grid-cols-[380px_1fr]">
        <div className="flex flex-col border-b border-zinc-800 lg:border-b-0 lg:border-r">
          <div className="flex gap-1 border-b border-zinc-800 p-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  filter === f.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="max-h-[70vh] flex-1 overflow-y-auto">
            {tickets.length === 0 && <p className="p-6 text-sm text-zinc-500">No tickets here.</p>}
            {tickets.map((t) => (
              <TicketRow key={t.id} ticket={t} active={t.id === selected?.id} onSelect={() => setSelectedId(t.id)} />
            ))}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {selected ? (
            <TicketPanel ticket={selected} />
          ) : (
            <p className="p-6 text-sm text-zinc-500">Select a ticket to see how the agent decided.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
