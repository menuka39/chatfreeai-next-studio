/**
 * Showcase items — the curated examples on the video and image generators.
 *
 * Reads are deliberately forgiving. If the table hasn't been created yet, or
 * the query fails, this returns an empty list rather than throwing: the
 * gallery is an enhancement, and a visitor who came to generate something
 * should never be shown an error because the marketing strip is unavailable.
 * The page simply omits the section, or falls back to the built-in prompt
 * ideas.
 */

import { serviceQuery } from "./supabase/server";

/** Which studio an item belongs to. The two galleries never mix. */
export type ShowcaseSurface = "video" | "image";

export interface ShowcaseClip {
  id: string;
  /**
   * The media URL. Named `video_url` in the database because it predates
   * images; kept rather than renamed so existing rows keep working. For
   * surface==="image" this is the image.
   */
  videoUrl: string;
  posterUrl: string | null;
  prompt: string;
  modelName: string | null;
  aspect: string;
  sortOrder: number;
  published: boolean;
  surface: ShowcaseSurface;
  /** Also show this one on the studio's "Guess" tab. */
  inGuess: boolean;
}

interface Row {
  id: string;
  video_url: string;
  poster_url: string | null;
  prompt: string;
  model_name: string | null;
  aspect: string;
  sort_order: number;
  published: boolean;
  surface: string | null;
  in_guess: boolean | null;
}

const SELECT =
  "id,video_url,poster_url,prompt,model_name,aspect,sort_order,published,surface,in_guess";

const fromRow = (r: Row): ShowcaseClip => ({
  id: r.id,
  videoUrl: r.video_url,
  posterUrl: r.poster_url,
  prompt: r.prompt,
  modelName: r.model_name,
  aspect: r.aspect,
  sortOrder: r.sort_order,
  published: r.published,
  // Rows created before the column existed are video items.
  surface: r.surface === "image" ? "image" : "video",
  inGuess: r.in_guess === true,
});

const ORDER = "order=sort_order.asc,created_at.desc";

/**
 * What visitors see in a studio's "Get inspired" gallery.
 *
 * `surface=in.(...)` rather than `eq.` so rows written before the column
 * existed — which are NULL, not 'video' — still appear on the video
 * generator instead of silently vanishing from a gallery that was working.
 */
export async function listShowcase(surface: ShowcaseSurface = "video"): Promise<ShowcaseClip[]> {
  const filter =
    surface === "video" ? "or=(surface.eq.video,surface.is.null)" : "surface=eq.image";
  const rows = await serviceQuery<Row[]>(
    `showcase_clips?published=eq.true&${filter}&select=${SELECT}&${ORDER}&limit=24`,
  );
  return (rows ?? []).map(fromRow);
}

/** What visitors see on a studio's "Guess" tab. */
export async function listGuess(surface: ShowcaseSurface = "video"): Promise<ShowcaseClip[]> {
  return (await listShowcase(surface)).filter((c) => c.inGuess);
}

/** Everything, including unpublished and both surfaces — for the admin screen. */
export async function listAllShowcase(): Promise<ShowcaseClip[]> {
  const rows = await serviceQuery<Row[]>(`showcase_clips?select=${SELECT}&${ORDER}`);
  return (rows ?? []).map(fromRow);
}
