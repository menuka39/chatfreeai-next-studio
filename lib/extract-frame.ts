/**
 * Reads a clean closing frame of a video as a JPEG data URI.
 *
 * Used to chain clips: the closing frame of one generation becomes the opening
 * frame of the next, which is how "extend" works when the provider API has no
 * video input. The file must be served from our own origin (see
 * /api/video/proxy) or the canvas is tainted and toDataURL throws.
 */

/**
 * Offsets from the end, in seconds, tried in order of preference.
 *
 * Seeking to `duration` exactly lands past the last decoded frame and paints
 * black, so the first candidate already steps back. But plenty of clips fade
 * out over the final half second, and a dim frame makes a poor seed — the next
 * generation starts from mud and every link after it inherits that. So several
 * candidates are read and scored, rather than trusting one offset to be good.
 */
const CANDIDATE_OFFSETS = [0.05, 0.15, 0.3, 0.6];

interface Candidate {
  uri: string;
  score: number;
}

/**
 * How usable a frame is as a seed: mean brightness times spread.
 *
 * A black or blown-out frame scores near zero on brightness; a flat fade or a
 * single-colour card scores near zero on spread. Multiplying means a frame has
 * to be both lit AND detailed to win, which is what a good seed is.
 */
function scoreFrame(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  // every 64th pixel is plenty for a brightness/variance estimate
  for (let i = 0; i < data.length; i += 256) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += lum;
    sumSq += lum * lum;
    n++;
  }
  if (!n) return 0;
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  // a frame this dark is a fade-out, not a shot
  if (mean < 12) return 0;
  return mean * Math.sqrt(variance);
}

/**
 * @param src        same-origin video URL (use proxiedVideo for provider links)
 * @param maxEdge    longest edge of the returned frame. Pass the clip's own
 *                   height so the seed is not downscaled: shrinking a 1080p
 *                   frame to 1280 and feeding it back as the first frame of
 *                   another 1080p render loses resolution at every link, and
 *                   three clips in the chain is visibly soft.
 */
export async function extractLastFrame(src: string, maxEdge = 1920): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };
    const fail = (msg: string) => {
      cleanup();
      reject(new Error(msg));
    };

    const timeout = setTimeout(() => fail("Timed out reading the video."), 30000);

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let offsets: number[] = [];
    let at = 0;
    let best: Candidate | null = null;

    const capture = (): Candidate | null => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const score = scoreFrame(ctx, canvas.width, canvas.height);
        // 0.95 rather than 0.9: this frame is re-encoded on top of the video's
        // own compression, and the model sees every artefact we add
        return { uri: canvas.toDataURL("image/jpeg", 0.95), score };
      } catch {
        // SecurityError = tainted canvas, i.e. it wasn't served same-origin
        return null;
      }
    };

    const next = () => {
      if (at >= offsets.length) {
        clearTimeout(timeout);
        cleanup();
        return best ? resolve(best.uri) : fail("Couldn't read a usable frame from that video.");
      }
      video.currentTime = Math.max(0, video.duration - offsets[at++]);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      fail("Could not load that video — the provider link may have expired.");
    };

    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        clearTimeout(timeout);
        return fail("That video has no readable duration.");
      }
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
      canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const c = canvas.getContext("2d", { willReadFrequently: true });
      if (!c) {
        clearTimeout(timeout);
        return fail("Canvas unavailable in this browser.");
      }
      ctx = c;
      // never sample past the start of a very short clip
      offsets = CANDIDATE_OFFSETS.filter((o) => o < video.duration);
      if (!offsets.length) offsets = [Math.min(0.05, video.duration / 2)];
      next();
    };

    video.onseeked = () => {
      const shot = capture();
      if (!shot) {
        clearTimeout(timeout);
        return fail("Couldn't read the frame from that video.");
      }
      if (!best || shot.score > best.score) best = shot;
      // a clearly good frame is worth stopping for — no need to seek three
      // more times when the first one is already bright and detailed
      if (shot.score > 900) {
        clearTimeout(timeout);
        cleanup();
        return resolve(shot.uri);
      }
      next();
    };

    video.src = src;
  });
}

/** Same-origin URL for a signed provider video. */
export const proxiedVideo = (url: string, token: string) =>
  `/api/video/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
