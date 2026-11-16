"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads data and reloads when `deps` change. Keeps the previous data while
 * reloading, so screens dim instead of flashing a skeleton.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true); setError("");
    try {
      const v = await run();
      if (id === seq.current) setData(v);
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => { reload(); }, [reload]);
  return { data, setData, error, loading, reload };
}
