/**
 * Where a video gets cut into shots.
 *
 * Shared by the Video to Prompt UI and its API route on purpose: the count the
 * user is shown before pressing the button has to be the count the model is
 * asked for. Computing it separately in each place is how a screen ends up
 * promising four scenes and returning three — the UI rounding one way on a
 * duration of 18.4 seconds, the server another.
 */

/** Scene lengths the user can pick. Every one is renderable by some model. */
export const SCENE_LENGTHS = [5, 6, 8, 10, 15] as const;
export type SceneLength = (typeof SCENE_LENGTHS)[number];

/**
 * Past this the output stops being useful: the model summarises to fit the
 * token budget, and nobody hand-renders sixty clips.
 */
export const MAX_SCENES = 24;

/** Shortest and longest single clip any model in lib/video-models.ts makes. */
const MIN_CLIP = 3;
const MAX_CLIP = 15;

export interface ScenePlan {
  n: number;
  start: number;
  end: number;
  header: string;
}

/** mm:ss for a whole number of seconds. */
function stamp(total: number) {
  const t = Math.round(total);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Cut points, computed rather than asked for.
 *
 * Letting the model place boundaries "of about N seconds" produced exactly
 * what you would expect — a run asked for 8s came back as a mix of 6s, 10s and
 * 15s. Length is arithmetic; the model has no business deciding it.
 *
 * The tail is the fiddly part. Dividing 47 seconds into 15s scenes leaves 2
 * over, and nothing will render a 2-second clip. So a short remainder folds
 * into the previous scene where that stays under the ceiling, and otherwise
 * the last scene's start is pulled back to give it a renderable length — a
 * second of overlap you trim when joining, instead of a clip you cannot make.
 */
export function planScenes(duration: number, sceneSeconds: number): ScenePlan[] {
  if (!(duration > 0) || !(sceneSeconds > 0)) return [];

  const out: ScenePlan[] = [];
  for (let start = 0; start < duration; start += sceneSeconds) {
    const end = Math.min(start + sceneSeconds, duration);
    out.push({ n: out.length + 1, start, end, header: "" });
    if (end >= duration || out.length >= MAX_SCENES) break;
  }

  const last = out[out.length - 1];
  if (last && out.length > 1 && last.end - last.start < MIN_CLIP) {
    const prev = out[out.length - 2];
    if (last.end - prev.start <= MAX_CLIP) {
      prev.end = last.end;
      out.pop();
    } else {
      last.start = Math.max(0, last.end - MIN_CLIP);
    }
    out.forEach((sc, i) => (sc.n = i + 1));
  }

  for (const sc of out) {
    sc.header = `### SCENE ${sc.n} | ${stamp(sc.start)} - ${stamp(sc.end)} | ${Math.round(sc.end - sc.start)}s`;
  }
  return out;
}
