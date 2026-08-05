/**
 * Reads the last visible frame of a video as a JPEG data URI.
 *
 * Used to chain clips: the closing frame of one generation becomes the opening
 * frame of the next, which is how "extend" works when the provider API has no
 * video input. The file must be served from our own origin (see
 * /api/video/proxy) or the canvas is tainted and toDataURL throws.
 *
 * Seeking to `duration` exactly often lands past the last decoded frame and
 * paints black, so we step back slightly.
 */
export async function extractLastFrame(src: string, maxEdge = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const fail = (msg: string) => {
      video.removeAttribute("src");
      video.load();
      reject(new Error(msg));
    };

    const timeout = setTimeout(() => fail("Timed out reading the video."), 30000);

    video.onerror = () => {
      clearTimeout(timeout);
      fail("Could not load that video — the provider link may have expired.");
    };

    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        clearTimeout(timeout);
        return fail("That video has no readable duration.");
      }
      // back off from the very end so we land on a decoded frame
      video.currentTime = Math.max(0, video.duration - 0.08);
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      try {
        const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return fail("Canvas unavailable in this browser.");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const uri = canvas.toDataURL("image/jpeg", 0.9);
        video.removeAttribute("src");
        video.load();
        resolve(uri);
      } catch {
        // SecurityError = tainted canvas, i.e. it wasn't served same-origin
        fail("Couldn't read the frame from that video.");
      }
    };

    video.src = src;
  });
}

/** Same-origin URL for a signed provider video. */
export const proxiedVideo = (url: string, token: string) =>
  `/api/video/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
