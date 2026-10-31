"use client";

import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { timeUtc } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const ROLLBACK_BY = "support.lead";
const PAGE = 25;

const RESULT_STYLE: Record<AuditEntry["result"], string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  skipped_duplicate: "border-zinc-600 bg-zinc-800 text-zinc-300",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

function canRollback(e: AuditEntry): boolean {
  return e.reversible && !e.rolled_back && e.result === "ok";
}

export default function AuditPage() {
  const { data, error, reload } = usePolling(() => api.audit());
  const [limit, setLimit] = useState(PAGE);
  const [onlyOk, setOnlyOk] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((e) => !onlyOk || e.result === "ok")
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Audit log</h1>
          <p className="text-sm text-zinc-500">Every action, who ran it, and whether it can be undone.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={onlyOk} onChange={(e) => setOnlyOk(e.target.checked)} className="size-4 accent-emerald-400" />
          Hide skipped duplicates ({(data ?? []).filter((e) => e.result === "skipped_duplicate").length})
        </label>
      </div>
      {(error || actionError) && <p className="mb-3 text-sm text-rose-400">{actionError ?? error}</p>}

      {data && rows.length === 0 && (
        <Card className="p-10 text-center text-zinc-400">No actions yet - approve a resolution plan to see entries here.</Card>
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[70px_80px_1fr_110px_120px_110px] gap-3 border-b border-zinc-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 md:grid">
            <span>Time</span>
            <span>ID</span>
            <span>Action / actor</span>
            <span>User</span>
            <span>Result</span>
            <span />
          </div>
          <div className="divide-y divide-zinc-800/70">
            {rows.slice(0, limit).map((e) => (
              <div key={e.id} className="grid grid-cols-[70px_80px_1fr] items-center gap-3 px-4 py-2.5 text-sm md:grid-cols-[70px_80px_1fr_110px_120px_110px]">
                <span className="font-mono text-xs text-zinc-500">{timeUtc(e.at)}</span>
                <span className="font-mono text-xs text-zinc-500">{e.id}</span>
                <span className="min-w-0">
                  <span className="text-zinc-200">{e.action.replace(/_/g, " ")}</span>
                  <span className="ml-2 text-xs text-zinc-500">{e.actor}</span>
                </span>
                <span className="font-mono text-xs text-zinc-400">{e.user_id}</span>
                <span>
                  {e.rolled_back ? (
                    <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">rolled back</Badge>
                  ) : (
                    <Badge className={RESULT_STYLE[e.result]}>{e.result.replace("_", " ")}</Badge>
                  )}
                </span>
                <span className="text-right">
                  {canRollback(e) && (
                    <button
                      onClick={() => rollback(e.id)}
                      disabled={pending === e.id}
                      className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
                    >
                      {pending === e.id ? "…" : "Roll back"}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
          {rows.length > limit && (
            <button
              onClick={() => setLimit((l) => l + PAGE)}
              className="w-full border-t border-zinc-800 px-4 py-2 text-left text-xs text-zinc-400 hover:text-zinc-100"
            >
              Show more ({rows.length - limit} left)
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
