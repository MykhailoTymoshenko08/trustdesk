"use client";

import { useState } from "react";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { usd } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";

export default function DevCardPage() {
  const { data: incidents } = usePolling(() => api.incidents(), 4000);
  const incidentId = incidents?.[0]?.id;
  const { data: card, error } = usePolling(
    () => (incidentId ? api.devcard(incidentId) : Promise.resolve(null)),
    5000,
  );
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Dev card</h1>
        <p className="text-sm text-zinc-500">Everything an engineer needs to start fixing - no digging through tickets.</p>
        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      </div>

      {incidents && incidents.length === 0 && (
        <Card className="p-10 text-center text-zinc-400">No incident yet - a dev card appears when one is detected.</Card>
      )}

      {card && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            <Card className="grid grid-cols-3 divide-x divide-zinc-800">
              <Stat label="Feature" value={card.feature} mono />
              <Stat label="Release" value={card.release} mono />
              <Stat label="Cost" value={usd(card.impact.money_at_risk_cents)} tone="text-rose-300" />
            </Card>
            <section>
              <SectionTitle>Entry points</SectionTitle>
              <Card className="divide-y divide-zinc-800/70">
                {card.entry_points.map((e) => (
                  <div key={`${e.path}:${e.symbol}`} className="px-4 py-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge className="border-zinc-700 text-zinc-400">{e.app}</Badge>
                      <span className="font-mono text-sm text-zinc-100">{e.symbol}</span>
                    </div>
                    <div className="font-mono text-xs text-zinc-500">{e.path}</div>
                    {e.route && <div className="mt-1 font-mono text-xs text-amber-300">{e.route}</div>}
                  </div>
                ))}
              </Card>
            </section>
            <section>
              <SectionTitle>Repro steps (from real user logs)</SectionTitle>
              <Card className="p-4">
                <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-300 marker:text-zinc-600">
                  {card.repro_steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </Card>
            </section>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle>Markdown for Jira / GitHub</SectionTitle>
              <button
                onClick={copy}
                className="rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-950 hover:bg-white"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <Card className="overflow-x-auto p-4">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">{card.markdown}</pre>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono, tone = "text-zinc-100" }: { label: string; value: string; mono?: boolean; tone?: string }) {
  return (
    <div className="p-4">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`${mono ? "font-mono text-sm" : "font-mono text-xl"} font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
