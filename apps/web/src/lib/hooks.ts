"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";

export function useApi<T>(path: string | null, options?: { enabled?: boolean; pollMs?: number }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(Boolean(path));
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const enabled = options?.enabled ?? true;

  const load = useCallback(
    async (mode: "initial" | "refresh" = "refresh") => {
      if (!path || !enabled) return;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const result = await api<T>(path);
        if (!mounted.current) return;
        setData(result);
        setError("");
      } catch (cause) {
        if (!mounted.current) return;
        setError(cause instanceof Error ? cause.message : "Something went wrong while loading this view.");
      } finally {
        if (!mounted.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path, enabled],
  );

  useEffect(() => {
    mounted.current = true;
    void load("initial");
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!options?.pollMs || !path || !enabled) return;
    const timer = window.setInterval(() => void load("refresh"), options.pollMs);
    return () => window.clearInterval(timer);
  }, [load, options?.pollMs, path, enabled]);

  return { data, error, loading, refreshing, reload: () => load("refresh"), setData };
}

export function useMutation() {
  const [pending, setPending] = useState<string>("");
  const [error, setError] = useState<string>("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function run<T>(key: string, task: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    setPending(key);
    setError("");
    try {
      const data = await task();
      return { ok: true, data };
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "The action could not be completed.";
      if (mounted.current) setError(message);
      return { ok: false, error: message };
    } finally {
      if (mounted.current) setPending("");
    }
  }

  return { run, pending, error, clearError: () => setError("") };
}

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener("change", listener);
    return () => list.removeEventListener("change", listener);
  }, [query]);
  return matches;
}

export function useOnClickOutside<T extends HTMLElement>(ref: React.RefObject<T | null>, handler: () => void) {
  useEffect(() => {
    function listener(event: MouseEvent | TouchEvent) {
      const element = ref.current;
      if (!element || element.contains(event.target as Node)) return;
      handler();
    }
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

export function useLockBody(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

export function useRefreshSignal(handler: () => void, deps: React.DependencyList = []) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener = () => handlerRef.current();
    window.addEventListener("dataops:refresh", listener);
    return () => window.removeEventListener("dataops:refresh", listener);
  }, deps);
}

export type HotkeyHandler = () => void;

type HotkeyBinding = { keys: string; handler: HotkeyHandler; allowInInput?: boolean };

function matchesModifiers(parts: string[], event: KeyboardEvent): boolean {
  const needsMeta = parts.includes("cmd") || parts.includes("meta");
  const needsCtrl = parts.includes("ctrl");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");
  if (needsMeta && !(event.metaKey || event.ctrlKey)) return false;
  if (!needsMeta && (event.metaKey || event.ctrlKey)) return false;
  if (needsCtrl && !event.ctrlKey) return false;
  if (needsShift !== event.shiftKey) return false;
  if (needsAlt !== event.altKey) return false;
  return true;
}

function isEditing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return /INPUT|TEXTAREA|SELECT/.test(element.tagName) || element.isContentEditable;
}

export function useHotkeys(bindings: HotkeyBinding[]) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const pendingPrefix = useRef<{ value: string; expires: number } | null>(null);

  useEffect(() => {
    function reset() {
      pendingPrefix.current = null;
    }

    function onKeyDown(event: KeyboardEvent) {
      const current = bindingsRef.current;
      const editing = isEditing(event.target);

      const pending = pendingPrefix.current;
      if (pending) {
        if (Date.now() > pending.expires) {
          reset();
        } else {
          const match = current.find(binding => {
            const parts = binding.keys.toLowerCase().split(" ");
            return parts.length === 2 && parts[0] === pending.value && parts[1] === event.key.toLowerCase();
          });
          pendingPrefix.current = null;
          if (match && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            match.handler();
            return;
          }
        }
      }

      for (const binding of current) {
        const raw = binding.keys.toLowerCase().trim();
        if (raw.includes(" ")) {
          const prefix = raw.split(" ")[0];
          if (event.key.toLowerCase() !== prefix) continue;
          if (event.metaKey || event.ctrlKey || event.altKey) continue;
          if (editing && !binding.allowInInput) continue;
          pendingPrefix.current = { value: prefix, expires: Date.now() + 1200 };
          return;
        }
        const parts = raw.split("+");
        const key = parts[parts.length - 1];
        if (!matchesModifiers(parts, event)) continue;
        if (event.key.toLowerCase() !== key) continue;
        if (editing && !binding.allowInInput) continue;
        event.preventDefault();
        binding.handler();
        return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

export type ThemePreference = "light" | "dark" | "system";

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    return (window.localStorage.getItem("dataops_theme") as ThemePreference | null) ?? "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      const resolved = preference === "system" ? (media.matches ? "dark" : "light") : preference;
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
    }
    apply();
    if (preference !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  const update = useCallback((next: ThemePreference) => {
    setPreference(next);
    window.localStorage.setItem("dataops_theme", next);
  }, []);

  return { preference, setPreference: update };
}
