"use client";

import { useEffect, useRef, useState } from "react";

// eases a number towards `target`; counts up from 0 on mount, honours reduced motion
export function useCountUp(target: number, ms = 800): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = reduced ? 1 : Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = origin + (target - origin) * eased;
      from.current = next;
      setValue(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return value;
}

// staggered entrance delay for list rows, capped so long lists do not drag
export const stagger = (i: number, step = 28, cap = 400) => ({ "--d": `${Math.min(i * step, cap)}ms` }) as React.CSSProperties;
