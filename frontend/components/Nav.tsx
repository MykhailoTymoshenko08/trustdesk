"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, USE_MOCK } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Inbox" },
  { href: "/incidents", label: "Incidents" },
  { href: "/devcard", label: "Dev card" },
  { href: "/audit", label: "Audit" },
  { href: "/trust", label: "Trust" },
];

export function Nav() {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const simulate = () =>
    run(async () => {
      await api.demoReset();
      await api.demoWave();
    });

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-100">
          <span className="grid size-6 place-items-center rounded-md bg-emerald-400 text-xs font-bold text-zinc-950">T</span>
          TrustDesk
        </Link>
        <nav className="flex gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {USE_MOCK && (
            <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
              mock data
            </span>
          )}
          <button
            disabled={busy}
            onClick={() => run(api.demoReset)}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-50"
          >
            Reset
          </button>
          <button
            disabled={busy}
            onClick={simulate}
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-white disabled:opacity-50"
          >
            Simulate release v2.14
          </button>
        </div>
      </div>
    </header>
  );
}
