"use client";

import { useState } from "react";
import { Button, CountUp, Figure, Heading, Label } from "@/components/ui";
import { api } from "@/lib/api";
import { stagger } from "@/lib/motion";
import { usePolling } from "@/lib/usePolling";

export default function DevCardPage() {
  const { data, error } = usePolling(async () => {
    const [incident] = await api.incidents();
    return { card: incident ? await api.devcard(incident.id) : null };
  }, 4000);
  const card = data?.card ?? null;
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
      {error && <p className="mb-4 text-sm text-signal">{error}</p>}

      {data && !card && (
        <div className="py-16">
          <Heading>No dev card yet.</Heading>
          <p className="mt-4 max-w-md text-[17px] text-mute">A card appears as soon as an incident is detected.</p>
        </div>
      )}

      {card && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-x-5 font-mono text-[12px] text-mute">
            <span>{card.feature}</span>
            <span className="text-ink">{card.release}</span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-4">
            <Heading className="max-w-3xl">Everything needed to start fixing.</Heading>
            <div className="pb-1">
              <Figure tone="text-signal">
                <CountUp value={card.impact.money_at_risk_cents / 100} format={(n) => `$${Math.round(n).toLocaleString("en-US")}`} />
              </Figure>
              <p className="mt-3 text-[15px] text-mute">
                at risk · {card.impact.affected_users} families, {card.impact.missed_lessons} missed lessons
              </p>
            </div>
          </div>

          <div className="mt-20 grid gap-x-16 gap-y-16 lg:grid-cols-2">
            <div className="space-y-14">
              <section>
                <Label className="mb-4">Entry points</Label>
                {card.entry_points.length === 0 && <p className="text-sm text-mute">No entry points documented for this feature.</p>}
                {card.entry_points.map((e, i) => (
                  <div key={`${e.path}:${e.symbol}`} style={stagger(i)} className="rise border-t border-line py-3.5">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-[15px] text-ink">{e.symbol}</span>
                      <span className="font-mono text-[11px] text-faint">{e.app}</span>
                    </div>
                    <div className="mt-1 font-mono text-[12px] text-mute">{e.path}</div>
                    {e.route && <div className="mt-1 font-mono text-[12px] text-ink">{e.route}</div>}
                  </div>
                ))}
              </section>

              <section>
                <Label className="mb-4">Repro steps, from real user logs</Label>
                <ol className="space-y-3">
                  {card.repro_steps.map((s, i) => (
                    <li key={s} style={stagger(i)} className="rise border-l-2 border-line pl-4 font-mono text-[12.5px] leading-relaxed text-ink/90">
                      {s}
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <Label>Markdown for Jira or GitHub</Label>
                <Button onClick={copy} className="!py-1.5">
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap border-l-2 border-faint pl-5 font-mono text-[12.5px] leading-relaxed text-ink/90">
                {card.markdown}
              </pre>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
