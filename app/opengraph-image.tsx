import { ImageResponse } from "next/og";

/**
 * A code-generated Open Graph image — no external asset needed. Rendered on
 * request by Next.js's built-in ImageResponse (JSX -> PNG), reusing the same
 * "Switchboard" palette as the live site (Void canvas, Signal orange, Wire
 * teal) so a shared link actually looks like the site, not a generic
 * placeholder. Without this, links shared on WhatsApp/Twitter/Facebook/Slack
 * showed no preview image at all — the metadata referenced /opengraph-image
 * but nothing existed at that path.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Chat Free AI — every model, one free chat";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0A0A0E",
          position: "relative",
        }}
      >
        {/* ambient signal-line motif, echoing the homepage hero */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: "absolute", inset: 0 }}
        >
          <path d="M 90 60 Q 90 220 600 400" stroke="#FF7A33" strokeWidth="1.5" strokeOpacity="0.35" fill="none" />
          <path d="M 1090 90 Q 1090 220 600 400" stroke="#3FCFC0" strokeWidth="1.5" strokeOpacity="0.3" fill="none" />
          <path d="M 300 20 Q 350 220 600 400" stroke="#FF7A33" strokeWidth="1.5" strokeOpacity="0.22" fill="none" />
          <path d="M 900 20 Q 850 220 600 400" stroke="#3FCFC0" strokeWidth="1.5" strokeOpacity="0.22" fill="none" />
          <circle cx="600" cy="400" r="6" fill="#FF7A33" />
        </svg>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: "#3FCFC0", display: "flex" }} />
          <div style={{ fontSize: 26, color: "#A6A39A", display: "flex" }}>Free chat · No account · No daily limits</div>
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 76,
            fontWeight: 600,
            color: "#F3F1EA",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex" }}>Chat free with ChatGPT,</div>
          <div style={{ display: "flex" }}>
            Gemini &amp; Claude <span style={{ color: "#FF7A33", marginLeft: 18 }}>— one line.</span>
          </div>
        </div>

        <div style={{ marginTop: 36, fontSize: 30, color: "#A6A39A", display: "flex" }}>chatfreeai.com</div>
      </div>
    ),
    { ...size },
  );
}
