"use client";

import { useCallback, useEffect, useState } from "react";

export interface ApiError {
  code: string;
  message?: string;
}

interface State<T> {
  key: string | null;
  data?: T;
  error?: ApiError;
}

/**
 * GETs JSON from one of our API routes. Pass null to skip. Requests are
 * aborted when the URL changes. Loading is derived (no setState in effects).
 */
export function useApi<T>(url: string | null): {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  retry: () => void;
} {
  const [state, setState] = useState<State<T>>({ key: null });
  const [attempt, setAttempt] = useState(0);
  const key = url ? `${attempt}:${url}` : null;

  useEffect(() => {
    if (!url || !key) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const err = (body as { error?: ApiError } | null)?.error;
          setState({ key, error: { code: err?.code ?? "network", message: err?.message } });
        } else {
          setState({ key, data: body as T });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ key, error: { code: "network", message: String(err) } });
      });
    return () => controller.abort();
  }, [url, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: !!key && !current,
    retry,
  };
}
