/**
 * Joins generated clips into one MP4 entirely in the browser.
 *
 * WHY IN THE BROWSER: the alternative is uploading everyone's clips to our
 * server, paying for the bandwidth and the CPU, and holding people's video on
 * disk. Doing it client-side means the files never leave the device and we
 * carry no storage or privacy burden for them.
 *
 * WHY IT USUALLY COSTS NOTHING IN QUALITY: chained clips come from the same
 * model at the same resolution, so they share codec and dimensions. That lets
 * ffmpeg's concat demuxer stream-copy them — no re-encode, no generation loss,
 * and fast. If a chain does mix formats the copy fails, and we fall back to a
 * real re-encode rather than producing a broken file.
 *
 * The ~30MB ffmpeg core is fetched from a CDN only when someone actually
 * clicks Join, so it costs nothing for everyone who doesn't.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// single-threaded core: no SharedArrayBuffer, so no COOP/COEP headers needed
// (which would otherwise break embeds and third-party scripts site-wide)
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

let ffmpeg: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

async function getFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (loading) return loading;

  loading = (async () => {
    onProgress?.("Loading the video engine (about 30MB, first time only)…");
    const instance = new FFmpeg();
    await instance.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpeg = instance;
    return instance;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export interface JoinInput {
  /**
   * Same-origin URL, a blob: URL, or a Blob. Provider links are cross-origin
   * and can't be fetched here — route them through /api/video/proxy.
   */
  source: string | Blob;
  label: string;
}

export interface JoinResult {
  blob: Blob;
  copied: boolean;
}

/**
 * @param clips  in playback order
 * @param onProgress  human-readable status for the UI
 */
export async function joinClips(
  clips: JoinInput[],
  onProgress?: (msg: string, percent?: number) => void,
): Promise<JoinResult> {
  if (clips.length < 2) throw new Error("Pick at least two clips to join.");
  if (clips.length > 12) throw new Error("Join up to 12 clips at a time.");

  const ff = await getFFmpeg(onProgress);

  ff.on("progress", ({ progress }) => {
    if (progress > 0 && progress <= 1) onProgress?.("Joining…", Math.round(progress * 100));
  });

  const names: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    onProgress?.(`Reading clip ${i + 1} of ${clips.length}…`);
    const name = `in${i}.mp4`;
    await ff.writeFile(name, await fetchFile(clips[i].source));
    names.push(name);
  }

  const listing = names.map((n) => `file '${n}'`).join("\n");
  await ff.writeFile("list.txt", new TextEncoder().encode(listing));

  // 1) stream copy — instant and lossless when the clips match
  let copied = true;
  try {
    onProgress?.("Joining without re-encoding…");
    await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "out.mp4"]);
  } catch {
    copied = false;
  }

  let data = copied ? ((await ff.readFile("out.mp4")) as Uint8Array) : new Uint8Array();

  // 2) the copy can "succeed" yet write nothing if the streams disagree
  if (!copied || data.byteLength < 1024) {
    copied = false;
    onProgress?.("Clips differ — re-encoding to match. This takes longer…");
    const inputs = names.flatMap((n) => ["-i", n]);
    const filter =
      names.map((_, i) => `[${i}:v:0]scale=1280:-2,setsar=1[v${i}]`).join(";") +
      ";" +
      names.map((_, i) => `[v${i}]`).join("") +
      `concat=n=${names.length}:v=1:a=0[outv]`;
    await ff.exec([
      ...inputs,
      "-filter_complex", filter,
      "-map", "[outv]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "out.mp4",
    ]);
    data = (await ff.readFile("out.mp4")) as Uint8Array;
  }

  // free the memory — these files are large and the instance is reused
  for (const n of [...names, "list.txt", "out.mp4"]) {
    try {
      await ff.deleteFile(n);
    } catch {
      /* already gone */
    }
  }

  if (!data || data.byteLength < 1024) throw new Error("Joining produced an empty file.");
  return { blob: new Blob([data as BlobPart], { type: "video/mp4" }), copied };
}
