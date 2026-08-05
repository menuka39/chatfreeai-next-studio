/**
 * Showcase clips — the curated examples on the video generator.
 *
 * Reads are deliberately forgiving. If the table hasn't been created yet, or
 * the query fails, this returns an empty list rather than throwing: the
 * gallery is an enhancement, and a visitor who came to generate a video
 * should never be shown an error because the marketing strip is unavailable.
 * The page simply omits the section.
 */

import { serviceQuery } from "./supabase/server";

export interface ShowcaseClip {
  id: string;
  videoUrl: string;
  posterUrl: string | null;
  prompt: string;
  modelName: string | null;
  aspect: string;
  sortOrder: number;
  published: boolean;
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
}

const SELECT = "id,video_url,poster_url,prompt,model_name,aspect,sort_order,published";

const fromRow = (r: Row): ShowcaseClip => ({
  id: r.id,
  videoUrl: r.video_url,
  posterUrl: r.poster_url,
  prompt: r.prompt,
  modelName: r.model_name,
  aspect: r.aspect,
  sortOrder: r.sort_order,
  published: r.published,
});

/** What visitors see. */
export async function listShowcase(): Promise<ShowcaseClip[]> {
  const rows = await serviceQuery<Row[]>(
    `showcase_clips?published=eq.true&select=${SELECT}&order=sort_order.asc,created_at.desc&limit=24`,
  );
  return (rows ?? []).map(fromRow);
}

/** Everything, including unpublished — for the admin screen. */
export async function listAllShowcase(): Promise<ShowcaseClip[]> {
  const rows = await serviceQuery<Row[]>(
    `showcase_clips?select=${SELECT}&order=sort_order.asc,created_at.desc`,
  );
  return (rows ?? []).map(fromRow);
}
