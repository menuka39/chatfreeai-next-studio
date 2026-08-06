/**
 * Studio projects — the save format used by every generator studio.
 *
 * This is a direct port of the WordPress studio's project store, field for
 * field, so a library written by the plugin and a library written here are the
 * same JSON. Nothing about the shape is "improved": `job_id` stays snake_case,
 * `ts` stays a millisecond epoch, the newest project stays at index 0, and the
 * localStorage keys are the plugin's own keys.
 *
 *   project = { id, title, ts, clips: [ clip, clip, … ] }
 *
 * The browser is always written first — a guest has nowhere else to keep a
 * library, and a signed-in user should never watch a spinner to see their own
 * work. The account copy is pushed on a 600 ms debounce and, on load, wins
 * whenever it has anything in it: the account is the source of truth across
 * devices, the browser is the cache.
 */

export type StudioKind = "image" | "video" | "audio" | "speech";

export interface StudioClip {
  /** provider job id — what the ZIP / merge endpoints are keyed by */
  job_id: string;
  url: string;
  model: string;
  prompt: string;
  ts: number;

  /* image */
  aspect?: string;
  size?: string;
  /** signature that lets the mask editor read this image through our proxy */
  token?: string;

  /* video */
  dur?: number;
  res?: string;
  /** signed URL that survives the provider link expiring */
  download?: string;
  raw?: string;
  /** stored closing frame this clip was extended FROM, if it was */
  seedFrame?: string;
  /** provider seed, carried across a chain so links stay consistent */
  seed?: number;
  /** the clip this one continues */
  parentJobId?: string;

  /* audio / speech */
  title?: string;
  format?: string;
  voice?: string;
  liked?: 0 | 1;
  seconds?: number;
}

export interface StudioProject {
  id: string;
  title: string;
  ts: number;
  clips: StudioClip[];
}

/**
 * The plugin's own localStorage keys, kept byte for byte. A user who used the
 * WordPress studio in this browser keeps their library when the Next app takes
 * over the page.
 */
const PREFIX: Record<StudioKind, string> = {
  image: "aig_projects_v1_",
  video: "avg_projects_v1_",
  audio: "caud_projects_v1_",
  speech: "cspk_projects_v1_",
};

export const storageKey = (kind: StudioKind, uid: string | null) =>
  PREFIX[kind] + (uid || "guest");

export const newProjectId = () =>
  "p" + Date.now() + "_" + Math.floor(Math.random() * 1000);

/** First 42 characters of the prompt, exactly as the plugin titled projects. */
export function projectTitle(prompt: string) {
  const t = (prompt || "").trim().replace(/\s+/g, " ");
  if (!t) return "Untitled project";
  return t.length > 42 ? t.slice(0, 42) + "…" : t;
}

export function readLocal(kind: StudioKind, uid: string | null): StudioProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(kind, uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StudioProject[]) : [];
  } catch {
    return [];
  }
}

export function writeLocal(kind: StudioKind, uid: string | null, projects: StudioProject[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(kind, uid), JSON.stringify(projects));
  } catch {
    /* quota full — the account copy still has it */
  }
}

/** Pull the account's copy. Returns null when signed out or unreachable. */
export async function fetchRemote(kind: StudioKind): Promise<StudioProject[] | null> {
  try {
    const res = await fetch(`/api/studio/projects?kind=${kind}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.signedIn) return null;
    return Array.isArray(data.projects) ? (data.projects as StudioProject[]) : [];
  } catch {
    return null;
  }
}

export async function pushRemote(kind: StudioKind, projects: StudioProject[]) {
  try {
    await fetch("/api/studio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, projects }),
    });
  } catch {
    /* offline — the browser copy is still correct */
  }
}

/**
 * Add a clip to the library.
 *
 * `extendPid` is the project the clip belongs to when the user pressed "Add
 * image" / "Extend scene"; anything else starts a new project at the top of
 * the list. Returns the new list AND the project id the studio is now inside,
 * because the caller needs both in the same render.
 */
export function addClip(
  projects: StudioProject[],
  clip: StudioClip,
  extendPid: string | null,
): { projects: StudioProject[]; currentId: string } {
  const list = projects.slice();
  const idx = extendPid ? list.findIndex((p) => p.id === extendPid) : -1;

  if (idx > -1) {
    const proj = { ...list[idx], clips: [...list[idx].clips, clip] };
    list[idx] = proj;
    return { projects: list, currentId: proj.id };
  }

  const proj: StudioProject = {
    id: newProjectId(),
    title: projectTitle(clip.prompt),
    ts: Date.now(),
    clips: [clip],
  };
  list.unshift(proj);
  return { projects: list, currentId: proj.id };
}

/** Every clip across every project, newest first — the Browser view. */
export function allClips(projects: StudioProject[]) {
  const out: { clip: StudioClip; proj: StudioProject }[] = [];
  for (const proj of projects) {
    for (const clip of proj.clips || []) {
      if (clip && clip.url) out.push({ clip, proj });
    }
  }
  out.sort((a, b) => (b.clip.ts || 0) - (a.clip.ts || 0));
  return out;
}
