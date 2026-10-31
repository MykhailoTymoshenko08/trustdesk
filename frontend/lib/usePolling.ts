"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Polled<T> {
  data: T | null;
  error: string | null;
  reload: () => Promise<void>;
}

// calls fetcher now and then every `ms`; keeps the last good data on errors
export function usePolling<T>(fetcher: () => Promise<T>, ms = 2000): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const reload = useCallback(async () => {
    try {
      setData(await fetcherRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(reload, 0);
    const id = setInterval(reload, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [reload, ms]);

  return { data, error, reload };
}
