"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, USE_MOCK } from "@/lib/api";
import { Button } from "@/components/ui";

const LINKS = [
  { href: "/", label: "Inbox" },
  { href: "/incidents", label: "Incidents" },
  { href: "/devcard", label: "Dev card" },
  { href: "/audit", label: "Audit" },
  { href: "/qa", label: "QA" },
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
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-10 px-6">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em] text-ink">
          <span className="size-2.5 bg-signal" aria-hidden />
          TrustDesk
        </Link>
        <nav className="flex gap-6">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm ${active ? "text-ink" : "text-mute hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {USE_MOCK && <span className="font-mono text-[11px] text-faint">mock data</span>}
          <Button variant="ghost" disabled={busy} onClick={() => run(api.demoReset)}>
            Reset
          </Button>
          <Button disabled={busy} onClick={simulate}>
            Simulate release v2.14
          </Button>
        </div>
      </div>
    </header>
  );
}
