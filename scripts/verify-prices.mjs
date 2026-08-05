/**
 * Confirm every `estimated` price against OpenRouter and remove the flag.
 *
 *   OPENROUTER_API_KEY=sk-or-... node scripts/verify-prices.mjs         # report
 *   OPENROUTER_API_KEY=sk-or-... node scripts/verify-prices.mjs --write # apply
 *
 * For each entry marked `estimated: true` it fetches the live price, writes the
 * real number into the catalogue, recomputes the credits (or weight), and drops
 * the flag. Entries it cannot find are listed and left alone — never silently
 * "confirmed".
 *
 * Removing the flag removes the 2x safety factor, so only ever do it with a
 * live price in hand. Re-run `npm run audit:margins` afterwards.
 */

import { readFileSync, writeFileSync } from "node:fs";

const WRITE = process.argv.includes("--write");
const CREDIT_RATE = 0.126;
const KEY = process.env.OPENROUTER_API_KEY;

if (!KEY) {
  console.error("OPENROUTER_API_KEY is not set — cannot verify anything.");
  process.exit(1);
}

const paths = {
  chat: new URL("../lib/models.ts", import.meta.url),
  video: new URL("../lib/video-models.ts", import.meta.url),
  image: new URL("../lib/image-models.ts", import.meta.url),
  audio: new URL("../lib/audio-models.ts", import.meta.url),
};

/* ---------- fetch live prices ---------- */
const live = new Map();
for (const url of [
  "https://openrouter.ai/api/v1/models",
  "https://openrouter.ai/api/v1/models?output_modality=video",
  "https://openrouter.ai/api/v1/models?output_modality=image",
]) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!res.ok) continue;
    const { data = [] } = await res.json();
    for (const e of data) live.set(e.id, e.pricing);
  } catch {
    /* try the next endpoint */
  }
}
if (!live.size) {
  console.error("Could not reach OpenRouter. Nothing verified.");
  process.exit(1);
}
console.log(`fetched pricing for ${live.size} models\n`);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Pull a per-unit price out of either pricing shape. */
function unitPrice(pricing, unit) {
  if (!pricing) return undefined;
  if (Array.isArray(pricing)) {
    for (const row of pricing) {
      const u = String(row.unit ?? "").toLowerCase();
      const cost = num(row.cost_usd ?? row.cost);
      if (cost === undefined) continue;
      if (unit === "second" && (u === "second" || u === "seconds")) return cost;
      if (unit === "image" && u === "image") return cost;
      if (unit === "megapixel" && (u === "megapixel" || u === "mp")) return cost;
    }
    return undefined;
  }
  if (unit === "second") return num(pricing.per_second ?? pricing.video);
  if (unit === "image") return num(pricing.image ?? pricing.per_image);
  return undefined;
}

function tokenPrices(pricing) {
  if (!pricing || Array.isArray(pricing)) return undefined;
  const p = num(pricing.prompt);
  const c = num(pricing.completion);
  if (p === undefined || c === undefined) return undefined;
  return { in: p * 1e6, out: c * 1e6 };
}

const confirmed = [];
const missing = [];

/* ---------- video: per-resolution costPerSec ---------- */
let V = readFileSync(paths.video, "utf8");
for (const block of V.matchAll(/openrouter: "([^"]+)",[\s\S]*?resolutions: \[([\s\S]*?)\],/g)) {
  const slug = block[1];
  for (const r of block[2].matchAll(
    /\{ label: "([^"]+)", costPerSec: ([\d.]+), creditsPerSec: ([\d_]+), estimated: true \}/g,
  )) {
    const realPerSec = unitPrice(live.get(slug), "second");
    if (realPerSec === undefined) {
      missing.push(`video  ${slug} ${r[1]}`);
      continue;
    }
    const credits = Math.ceil((realPerSec / CREDIT_RATE) * 1e6);
    V = V.replace(
      r[0],
      `{ label: "${r[1]}", costPerSec: ${realPerSec}, creditsPerSec: ${credits} }`,
    );
    confirmed.push(
      `video  ${slug} ${r[1]}: $${r[2]} -> $${realPerSec}/s  (credits ${r[3].replaceAll("_", "")} -> ${credits})`,
    );
  }
}

/* ---------- image: costUsd + credits ---------- */
let I = readFileSync(paths.image, "utf8");
for (const block of I.matchAll(
  /openrouter: "([^"]+)",[\s\S]*?credits: ([\d_]+),\s*\n\s*costUsd: ([\d.]+),([\s\S]*?)(?=\n  \},)/g,
)) {
  if (!block[4].includes("estimated: true")) continue;
  const slug = block[1];
  const perImage = unitPrice(live.get(slug), "image") ?? unitPrice(live.get(slug), "megapixel");
  if (perImage === undefined) {
    missing.push(`image  ${slug}`);
    continue;
  }
  const credits = Math.ceil((perImage / CREDIT_RATE) * 1e6);
  const updated = block[0]
    .replace(`credits: ${block[2]},`, `credits: ${credits},`)
    .replace(`costUsd: ${block[3]},`, `costUsd: ${perImage},`)
    .replace(/\n\s*estimated: true,/, "");
  I = I.replace(block[0], updated);
  confirmed.push(`image  ${slug}: $${block[3]} -> $${perImage}/image  (credits -> ${credits})`);
}

/* ---------- audio: per-character price ---------- */
let A = readFileSync(paths.audio, "utf8");
for (const block of A.matchAll(
  /openrouter: "([^"]+)",[\s\S]*?costPerMillionChars: ([\d.]+),\s*\n\s*creditsPerChar: ([\d_]+),([\s\S]*?)(?=\n  \},)/g,
)) {
  if (!block[4].includes("estimated: true")) continue;
  const slug = block[1];
  const t = tokenPrices(live.get(slug));
  // TTS models expose their per-character rate in the prompt field
  if (!t) {
    missing.push(`audio  ${slug}`);
    continue;
  }
  const perMillion = t.in;
  const creditsPerChar = Math.ceil((perMillion / 1e6 / CREDIT_RATE) * 1e6);
  const updated = block[0]
    .replace(`costPerMillionChars: ${block[2]},`, `costPerMillionChars: ${perMillion},`)
    .replace(`creditsPerChar: ${block[3]},`, `creditsPerChar: ${creditsPerChar},`)
    .replace(/\n\s*estimated: true,/, "");
  A = A.replace(block[0], updated);
  confirmed.push(`audio  ${slug}: $${block[2]}/M chars -> $${perMillion}/M  (credits/char -> ${creditsPerChar})`);
}

/* ---------- chat: price.in / price.out + weight ---------- */
let M = readFileSync(paths.chat, "utf8");
for (const block of M.matchAll(
  /openrouter: "([^"]+)",[\s\S]*?price: \{ in: ([\d.]+), out: ([\d.]+) \},\s*\n\s*weight: ([\d.]+),([\s\S]*?)(?=\n  \},)/g,
)) {
  if (!block[5].includes("estimated: true")) continue;
  const slug = block[1];
  const t = tokenPrices(live.get(slug));
  if (!t) {
    missing.push(`chat   ${slug}`);
    continue;
  }
  const weight = Math.ceil((t.in * 0.4 + t.out * 0.6) / CREDIT_RATE);
  const updated = block[0]
    .replace(`price: { in: ${block[2]}, out: ${block[3]} },`, `price: { in: ${t.in}, out: ${t.out} },`)
    .replace(`weight: ${block[4]},`, `weight: ${weight},`)
    .replace(/\n\s*estimated: true,/, "");
  M = M.replace(block[0], updated);
  confirmed.push(
    `chat   ${slug}: $${block[2]}/$${block[3]} -> $${t.in}/$${t.out}  (weight ${block[4]} -> ${weight})`,
  );
}

/* ---------- report ---------- */
if (confirmed.length) {
  console.log(`confirmed ${confirmed.length} estimated price(s):`);
  for (const c of confirmed) console.log(`  ✓ ${c}`);
} else {
  console.log("nothing to confirm — no estimated entries matched a live price.");
}

if (missing.length) {
  console.log(`\n${missing.length} entry(ies) NOT found on OpenRouter — flag kept, safety factor stays:`);
  for (const m of missing) console.log(`  ? ${m}`);
  console.log("  (a missing slug will also 404 in production — fix the slug first)");
}

if (WRITE && confirmed.length) {
  writeFileSync(paths.video, V);
  writeFileSync(paths.image, I);
  writeFileSync(paths.chat, M);
  writeFileSync(paths.audio, A);
  console.log("\nwritten. Now run: npm run audit:margins");
} else if (confirmed.length) {
  console.log("\nreport only — re-run with --write to apply.");
}
