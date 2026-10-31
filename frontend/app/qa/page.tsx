"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button, CountUp, Heading, Label } from "@/components/ui";
import { api } from "@/lib/api";
import { timeUtc } from "@/lib/format";
import { stagger } from "@/lib/motion";
import type { QaItem } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const FLAG_BELOW = 70;

const scoreTone = (n: number): string => (n >= 80 ? "text-safe" : n < 60 ? "text-signal" : "text-ink");

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

function Detail({ item }: { item: QaItem }) {
  return (
    <div className="rise grid gap-x-12 gap-y-8 pb-8 pt-2 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-3">
          <Bar label="Accuracy" value={item.scores.accuracy} />
          <Bar label="Empathy" value={item.scores.empathy} />
          <div>
            <div className="mb-1.5 text-[13px] text-mute">Resolved</div>
            <div className="text-[15px] text-ink">{item.scores.resolved ? "yes" : "no"}</div>
          </div>
        </div>
        <div>
          <Label className="mb-3">Issues ({item.issues.length})</Label>
          {item.issues.length === 0 ? (
            <p className="text-sm text-mute">No issues found.</p>
          ) : (
            <ul className="space-y-2">
              {item.issues.map((i) => (
                <li key={i} className="border-l-2 border-signal py-0.5 pl-4 text-[15px] leading-snug text-ink">
                  {i}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <Label>Better reply</Label>
          <CopyButton text={item.better_reply} />
        </div>
        <p className="border-l-2 border-safe pl-4 text-[15px] leading-relaxed text-ink/90">{item.better_reply}</p>
      </div>
    </div>
  );
}

function Row({ item, index, open, onToggle }: { item: QaItem; index: number; open: boolean; onToggle: () => void }) {
  return (
    <div className="rise border-t border-line" style={stagger(index)}>
      <button onClick={onToggle} className="grid w-full grid-cols-[72px_1fr] items-baseline gap-x-6 py-5 text-left sm:grid-cols-[88px_1fr_120px]">
        <span className={`font-mono text-[40px] font-medium leading-none tracking-[-0.05em] tabular-nums ${scoreTone(item.score)}`}>{item.score}</span>
        <span className="min-w-0">
          <span className="mb-1 block text-[13px] text-mute">
            {item.agent}
            {item.ticket_id && <span className="ml-3 font-mono text-faint">{item.ticket_id}</span>}
          </span>
          <span className={`block text-[15px] leading-snug text-ink ${open ? "" : "line-clamp-2"}`}>{item.reply}</span>
        </span>
        <span className="col-span-2 mt-2 flex items-center gap-4 sm:col-span-1 sm:mt-0 sm:justify-end">
          <span className="font-mono text-[12px] text-faint">{timeUtc(item.created_at)}</span>
          <span className="text-[13px] text-mute">{item.issues.length} issue{item.issues.length === 1 ? "" : "s"}</span>
        </span>
      </button>
      {open && <Detail item={item} />}
    </div>
  );
}

function Scorer({ onScored }: { onScored: (item: QaItem) => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.qaScore({ ticket_id: null, reply: reply.trim() });
      onScored(data);
      setReply("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not score reply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-12">
      <Label className="mb-3">Score a new reply</Label>
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={4}
        placeholder="Paste a human agent reply to check it against the docs and for tone"
        aria-label="Reply to score"
        className="w-full resize-y border-b border-line bg-transparent py-2 text-[17px] leading-relaxed text-ink placeholder:text-faint focus:border-mute focus:outline-none"
      />
      <div className="mt-4 flex items-center gap-4">
        <Button type="submit" disabled={busy || !reply.trim()}>
          {busy ? "Scoring…" : "Score reply"}
        </Button>
        {error && <span className="text-sm text-signal">{error}</span>}
      </div>
    </form>
  );
}

export default function QaPage() {
  const { data, error, reload } = usePolling(() => api.qa(), 10_000);
  const [mine, setMine] = useState<QaItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const server = data?.data ?? [];
  const known = new Set(server.map((i) => i.id));
  const items = [...mine.filter((m) => !known.has(m.id)), ...server];
  const open = openId ?? items[0]?.id ?? null;
  const avg = items.length ? items.reduce((s, i) => s + i.score, 0) / items.length : null;
  const flagged = items.filter((i) => i.score < FLAG_BELOW).length;

  return (
    <div>
      <Heading>Reply QA</Heading>
      <p className="mt-3 max-w-xl text-[17px] text-mute">
        Human replies scored against the docs, for tone and for whether they resolve the problem.
      </p>
      {error && <p className="mt-3 text-sm text-signal">{error}</p>}
      {data?.mocked && <p className="mt-3 font-mono text-[12px] text-faint">sample data - backend /qa not available yet</p>}

      <div className="mt-10 flex flex-wrap gap-x-12 gap-y-4 border-y border-line py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] text-mute">Average score</span>
          <span className="font-mono text-[15px] tabular-nums text-ink">{avg === null ? "—" : <CountUp value={avg} />}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] text-mute">Replies reviewed</span>
          <span className="font-mono text-[15px] tabular-nums text-ink">{items.length || "—"}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] text-mute">Below {FLAG_BELOW}</span>
          <span className={`font-mono text-[15px] tabular-nums ${flagged > 0 ? "text-signal" : "text-ink"}`}>{items.length ? flagged : "—"}</span>
        </div>
      </div>

      <Scorer
        onScored={(item) => {
          setMine((m) => [item, ...m]);
          setOpenId(item.id);
          void reload();
        }}
      />

      <div className="mt-16">
        <Label className="mb-3">Reviewed replies</Label>
        {data && items.length === 0 && <p className="py-8 text-[15px] text-mute">No replies reviewed yet.</p>}
        <div className="border-b border-line">
          {items.map((item, i) => (
            <Row key={item.id} item={item} index={i} open={open === item.id} onToggle={() => setOpenId(open === item.id ? "" : item.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
