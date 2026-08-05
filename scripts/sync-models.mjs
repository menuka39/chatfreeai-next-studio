/**
 * Verify + refresh the model catalogue against OpenRouter's live /models API.
 *
 *   node scripts/sync-models.mjs          # report only
 *   node scripts/sync-models.mjs --write  # rewrite prices + weights in lib/models.ts
 *
 * Model slugs and prices change often. Run this monthly. If a slug 404s here it
 * will 404 in production too, so treat a "MISSING" row as a release blocker.
 */

import { readFileSync, writeFileSync } from "node:fs";

const WRITE = process.argv.includes("--write");
const SRC = new URL("../lib/models.ts", import.meta.url);

/** weight = how many credits we charge per real token. */
export function weightFor(inPrice, outPrice) {
  // Blend assumes a typical chat turn is ~60% input / 40% output.
  const blended = inPrice * 0.6 + outPrice * 0.4;
  const baseline = 0.09 * 0.6 + 0.18 * 0.4; // Deepseek Flash = weight 1
  return Math.max(1, Math.round((blended / baseline) * 2) / 2); // nearest 0.5
}

const res = await fetch("https://openrouter.ai/api/v1/models");
if (!res.ok) {
  console.error(`OpenRouter /models returned ${res.status}`);
  process.exit(1);
}
const { data } = await res.json();
const live = new Map(data.map((m) => [m.id, m]));

const source = readFileSync(SRC, "utf8");
const slugs = [...source.matchAll(/openrouter:\s*"([^"]+)"/g)].map((m) => m[1]);

let updated = source;
let problems = 0;

console.log("slug".padEnd(42), "in/1M".padStart(9), "out/1M".padStart(9), "weight".padStart(7));
console.log("-".repeat(72));

for (const slug of slugs) {
  const m = live.get(slug);
  if (!m) {
    console.log(slug.padEnd(42), "  MISSING — not on OpenRouter");
    problems++;
    continue;
  }
  const inP = Number(m.pricing.prompt) * 1_000_000;
  const outP = Number(m.pricing.completion) * 1_000_000;
  const w = weightFor(inP, outP);
  console.log(
    slug.padEnd(42),
    inP.toFixed(3).padStart(9),
    outP.toFixed(3).padStart(9),
    String(w).padStart(7),
  );

  if (WRITE) {
    const block = new RegExp(
      `(openrouter:\\s*"${slug.replace(/[/.]/g, "\\$&")}",[\\s\\S]{0,400}?price:\\s*\\{[^}]*\\},[\\s\\S]{0,80}?weight:\\s*)[\\d.]+`,
    );
    updated = updated
      .replace(
        new RegExp(`(openrouter:\\s*"${slug.replace(/[/.]/g, "\\$&")}",[\\s\\S]{0,400}?price:\\s*\\{\\s*in:\\s*)[\\d.]+(,\\s*out:\\s*)[\\d.]+`),
        `$1${inP.toFixed(4)}$2${outP.toFixed(4)}`,
      )
      .replace(block, `$1${w}`);
  }
}

if (WRITE) {
  writeFileSync(SRC, updated);
  console.log("\nlib/models.ts updated.");
}

console.log(
  problems
    ? `\n⚠️  ${problems} slug(s) missing — fix before deploying.`
    : "\n✓ every slug resolves on OpenRouter.",
);
