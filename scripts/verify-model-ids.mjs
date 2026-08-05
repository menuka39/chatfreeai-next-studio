/**
 * Checks every model id in lib/image-models.ts and lib/video-models.ts against
 * what OpenRouter actually serves.
 *
 * These ids were written from documentation, never verified against the live
 * catalogue — and at least one was wrong in a way nothing catches at build
 * time: "bytedance/seedream-4.5" returned 404 "No model found" because the
 * real prefix is "bytedance-seed/". A wrong id fails only when a user picks
 * that model, and the error reaches them as a generic provider failure.
 *
 *   OPENROUTER_API_KEY=sk-or-... node scripts/verify-model-ids.mjs
 */
import { readFileSync } from "node:fs";

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error("Set OPENROUTER_API_KEY first.");
  process.exit(1);
}

const idsFrom = (file) =>
  [...readFileSync(file, "utf8").matchAll(/openrouter:\s*"([^"]+)"/g)].map((m) => m[1]);

const ours = [
  ...idsFrom("lib/image-models.ts").map((id) => ({ id, kind: "image" })),
  ...idsFrom("lib/video-models.ts").map((id) => ({ id, kind: "video" })),
];

const res = await fetch("https://openrouter.ai/api/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`Could not fetch the catalogue: HTTP ${res.status}`);
  process.exit(1);
}
const live = new Set(((await res.json()).data ?? []).map((m) => m.id));

let bad = 0;
for (const { id, kind } of ours) {
  const ok = live.has(id);
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "MISSING"}  ${kind.padEnd(5)}  ${id}`);
  if (!ok) {
    // suggest the closest live id, so a prefix typo is obvious
    const tail = id.split("/").pop();
    const near = [...live].filter((l) => l.includes(tail.split("-")[0])).slice(0, 4);
    if (near.length) console.log(`          did you mean: ${near.join(", ")}`);
  }
}
console.log(`\n${ours.length - bad}/${ours.length} ids exist on OpenRouter.`);
process.exit(bad ? 1 : 0);
