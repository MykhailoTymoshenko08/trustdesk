"use client";

import { useMemo, useState } from "react";
import { Button, Heading } from "@/components/ui";
import { api } from "@/lib/api";
import { timeUtc } from "@/lib/format";
import { stagger } from "@/lib/motion";
import type { AuditEntry } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const ROLLBACK_BY = "support.lead";
const PAGE = 25;

function canRollback(e: AuditEntry): boolean {
  return e.reversible && !e.rolled_back && e.result === "ok";
}

function ResultMark({ e }: { e: AuditEntry }) {
  if (e.rolled_back) return <span className="text-[13px] text-ink">rolled back</span>;
  if (e.result === "ok") {
    return (
      <span className="flex items-center gap-2 text-[13px] text-ink">
        <span className="size-1.5 rounded-full bg-safe" />
        ok
      </span>
    );
  }
  if (e.result === "failed") return <span className="text-[13px] text-signal">failed</span>;
  return <span className="text-[13px] text-faint">duplicate skipped</span>;
}

export default function AuditPage() {
  const { data, error, reload } = usePolling(() => api.audit());
  const [limit, setLimit] = useState(PAGE);
  const [onlyOk, setOnlyOk] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const skipped = (data ?? []).filter((e) => e.result === "skipped_duplicate").length;
  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((e) => !onlyOk || e.result !== "skipped_duplicate")
        .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)),
    [data, onlyOk],
  );

  async function rollback(id: string) {
    setPending(id);
    setActionError(null);
    try {
      await api.rollback(id, ROLLBACK_BY);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "rollback failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <Heading>Audit log</Heading>
      <p className="mt-3 max-w-xl text-[17px] text-mute">Every action, who ran it, and whether it can be undone.</p>

      <div className="mt-10 flex items-center justify-between border-b border-line pb-3">
        <span className="font-mono text-[12px] text-faint">{rows.length} entries</span>
        <label className="flex items-center gap-2.5 text-sm text-mute">
          <input type="checkbox" checked={onlyOk} onChange={(e) => setOnlyOk(e.target.checked)} className="size-4 accent-[#eceef2]" />
          Hide skipped duplicates ({skipped})
        </label>
      </div>
      {(error || actionError) && <p className="mt-4 text-sm text-signal">{actionError ?? error}</p>}

      {data && rows.length === 0 && <p className="py-12 text-[15px] text-mute">No actions yet. Approve a resolution plan to see entries here.</p>}

      <div>
        {rows.slice(0, limit).map((e, i) => (
          <div
            key={e.id}
            style={stagger(i, 18, 300)}
            className="rise grid grid-cols-[64px_70px_1fr] items-center gap-x-5 border-b border-line py-3 md:grid-cols-[64px_70px_1fr_90px_140px_100px]"
          >
            <span className="font-mono text-xs text-faint">{timeUtc(e.at)}</span>
            <span className="font-mono text-xs text-faint">{e.id}</span>
            <span className="min-w-0 text-[15px] text-ink">
              {e.action.replace(/[_:]/g, " ")}
              <span className="ml-3 text-[13px] text-mute">{e.actor}</span>
            </span>
            <span className="font-mono text-xs text-mute">{e.user_id}</span>
            <ResultMark e={e} />
            <span className="text-right">
              {canRollback(e) && (
                <Button variant="ghost" onClick={() => rollback(e.id)} disabled={pending === e.id} className="!py-0.5 underline underline-offset-4">
                  {pending === e.id ? "…" : "Roll back"}
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>
      {rows.length > limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="mt-4 text-sm text-mute hover:text-ink">
          Show more ({rows.length - limit} left)
        </button>
      )}
    </div>
  );
}
