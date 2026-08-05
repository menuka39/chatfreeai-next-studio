"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addClip,
  fetchRemote,
  pushRemote,
  readLocal,
  writeLocal,
  type StudioClip,
  type StudioKind,
  type StudioProject,
} from "@/lib/studio-projects";

/**
 * The project library, wired the way the plugin wired it.
 *
 * Order of events on mount is deliberate and matches the original: read the
 * browser copy synchronously so the Projects tab is populated on first paint,
 * then ask the account. A non-empty account copy replaces what's on screen
 * (the account is authoritative across devices); an empty one gets seeded with
 * whatever this browser was holding, which is what makes a guest's work
 * survive their first sign-in.
 */
export function useStudioProjects(
  kind: StudioKind,
  /**
   * Optional one-time import from an older store. Runs inside the load effect
   * so a migrated library lands in the same first paint as the local one, and
   * is pushed to the account with it — a separate effect would flash an empty
   * library and race the remote fetch.
   */
  migrate?: () => StudioProject[],
) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  /* ---- load: browser first, then the account ---- */
  useEffect(() => {
    let alive = true;
    const imported = migrate?.() ?? [];
    // an imported project the browser already has must not appear twice
    const existing = readLocal(kind, null);
    const known = new Set(existing.map((p) => p.id));
    const local = imported.length
      ? [...imported.filter((p) => !known.has(p.id)), ...existing]
      : existing;
    if (imported.length) writeLocal(kind, null, local);
    // localStorage is exactly the "external system" this rule exists to allow;
    // it just can't tell a synchronous read from a cascading state update. The
    // read has to happen after mount or server and client HTML disagree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjects(local);
    loaded.current = true;

    (async () => {
      const remote = await fetchRemote(kind);
      if (!alive || remote === null) return; // signed out — local is all there is
      setUid("account");
      if (remote.length) {
        setProjects(remote);
        writeLocal(kind, null, remote);
      } else if (local.length) {
        void pushRemote(kind, local);
      }
    })();

    return () => {
      alive = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // `migrate` is a one-time import keyed to `kind`; re-running it on a new
    // function identity would be wrong, and it self-guards anyway
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  /* ---- persist: browser immediately, account on a 600ms debounce ---- */
  const persist = useCallback(
    (next: StudioProject[]) => {
      writeLocal(kind, null, next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void pushRemote(kind, next);
      }, 600);
    },
    [kind],
  );

  const save = useCallback(
    (next: StudioProject[]) => {
      setProjects(next);
      persist(next);
    },
    [persist],
  );

  /** Append a clip — to `extendPid` when extending, otherwise a new project. */
  const push = useCallback(
    (clip: StudioClip, extendPid: string | null) => {
      let id = extendPid;
      setProjects((prev) => {
        const next = addClip(prev, clip, extendPid);
        id = next.currentId;
        persist(next.projects);
        return next.projects;
      });
      // setCurrentId outside the updater so it lands in the same commit
      if (id) setCurrentId(id);
      return id;
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        persist(next);
        return next;
      });
      setCurrentId((cur) => (cur === id ? null : cur));
    },
    [persist],
  );

  const current = projects.find((p) => p.id === currentId) ?? null;

  return { projects, current, currentId, setCurrentId, push, remove, save, signedIn: uid !== null };
}

export interface StudioCredits {
  signedIn: boolean;
  plan: string;
  packageName: string | null;
  used: number;
  cap: number;
  remaining: number;
  resetsAt: string | null;
}

/** Monthly package credits — the one balance every studio spends from. */
export function useStudioCredits() {
  const [credits, setCredits] = useState<StudioCredits | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/credits", { cache: "no-store" });
      if (!res.ok) return;
      setCredits((await res.json()) as StudioCredits);
    } catch {
      /* the studio works without the chip */
    }
  }, []);

  useEffect(() => {
    // fetching the balance is a subscription to an external system; the state
    // update happens in the promise callback, not during this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { credits, refresh };
}

/** "12.4M" / "840k" — the compact form used in every credit label. */
export function fmtCredits(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.max(0, Math.round(n)));
}

/** Time-of-day greeting — the plugin's exact thresholds. */
export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 20) return "Good evening";
  return "Good night";
}
