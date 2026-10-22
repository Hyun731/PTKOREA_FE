"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { api, ApiError, type Job } from "./api";

/** Fetch + reload. Keeps the last good data while reloading so screens don't flash. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api.get<T>(path);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e as ApiError);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "partial", "blocked_budget", "needs_review"]);

/** Poll a server job until it ends. Survives reloads: callers pass a job id read back from the server. */
export function useJob(jobId: string | null, onDone?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const j = await api.get<Job>(`/jobs/${jobId}`);
        if (!alive) return;
        setJob(j);
        if (TERMINAL.has(j.state)) {
          done.current?.(j);
          return;
        }
      } catch {
        /* transient: keep polling */
      }
      timer = setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobId]);
  return job;
}

/** Run a mutation; show the server's message + suggested action, and announce success. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const toast = useToast();
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const r = await fn();
        const msg = typeof success === "function" ? success(r) : success;
        if (msg) toast(msg);
        return r;
      } catch (e) {
        const err = e as ApiError;
        setError(err);
        toast(err.message, "error");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, error, run, setError };
}
