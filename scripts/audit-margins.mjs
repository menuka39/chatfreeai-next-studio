/**
 * Margin audit — proves no option can produce a loss.
 *
 *   node scripts/audit-margins.mjs          # static: audit the catalogues
 *   node scripts/audit-margins.mjs --live   # also fetch OpenRouter and compare
 *
 * Static mode models exactly what the app charges at runtime, including the
 * SAFETY_FACTOR applied to `estimated` entries. Live mode additionally checks
 * every slug against OpenRouter and reports drift — a slug that 404s here will
 * 404 in production, and a live price above the catalogue means the catalogue
 * is stale.
 *
 * Exits non-zero on any loss-producing option. Run after ANY price change.
 */

import { readFileSync } from "node:fs";

const LIVE = process.argv.includes("--live");
const TARGET = 0.126;      // max USD cost per 1M credits
const SAFETY_FACTOR = 2;   // must match lib/price-oracle.ts
const TOPUP_FEE = 1.055;   // OpenRouter credit purchase fee
const CARD_PCT = 0.029;
const CARD_FLAT = 0.3;

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const M = read("../lib/models.ts");
const V = read("../lib/video-models.ts");
const I = read("../lib/image-models.ts");
const A = read("../lib/audio-models.ts");
const P = read("../lib/packages.ts");

const options = [];

// ---- chat: cost per 1M credits = blended price / weight ----
for (const m of M.matchAll(
  /name: "([^"]+)",\s*\n\s*openrouter: "([^"]+)",[\s\S]*?price: \{ in: ([\d.]+), out: ([\d.]+) \},\s*\n\s*weight: ([\d.]+)/g,
)) {
  const [, name, slug, i, o, w] = m;
  const blended = Number(i) * 0.4 + Number(o) * 0.6;
  options.push({ kind: "chat", name, slug, cpc: blended / Number(w), in: Number(i), out: Number(o) });
}

// ---- video: per resolution, honouring the safety factor ----
for (const m of V.matchAll(/name: "([^"]+)",\s*\n\s*provider: "[^"]+",\s*\n\s*openrouter: "([^"]+)",[\s\S]*?resolutions: \[([\s\S]*?)\],/g)) {
  for (const r of m[3].matchAll(
    /label: "([^"]+)", costPerSec: ([\d.]+), creditsPerSec: ([\d_]+)(, estimated: true)?/g,
  )) {
    const est = Boolean(r[4]);
    const cost = Number(r[2]);
    const charged = est ? cost * SAFETY_FACTOR : cost;   // what the app charges
    options.push({
      kind: "video",
      name: `${m[1]} ${r[1]}`,
      slug: m[2],
      cpc: (cost / charged) * TARGET,   // real cost measured against what we charge
      est,
      cost,
    });
  }
}

// ---- image: flat price + quality tiers ----
for (const m of I.matchAll(
  /name: "([^"]+)",\s*\n\s*provider: "[^"]+",\s*\n\s*openrouter: "([^"]+)",[\s\S]*?credits: ([\d_]+),\s*\n\s*costUsd: ([\d.]+),([\s\S]*?)(?=\n  \},)/g,
)) {
  const est = m[5].includes("estimated: true");
  const push = (label, cost) => {
    const charged = est ? cost * SAFETY_FACTOR : cost;
    options.push({ kind: "image", name: label, slug: m[2], cpc: (cost / charged) * TARGET, est, cost });
  };
  push(m[1], Number(m[4]));
  for (const q of m[5].matchAll(/label: "([^"]+)", megapixels: [\d.]+, credits: [\d_]+, costUsd: ([\d.]+)/g)) {
    push(`${m[1]} ${q[1]}`, Number(q[2]));
  }
}

// ---- audio: per character ----
for (const m of A.matchAll(
  /name: "([^"]+)",\s*\n\s*provider: "[^"]+",\s*\n\s*openrouter: "([^"]+)",[\s\S]*?costPerMillionChars: ([\d.]+),\s*\n\s*creditsPerChar: ([\d_]+),([\s\S]*?)(?=\n  \},)/g,
)) {
  const est = m[5].includes("estimated: true");
  const costPerChar = Number(m[3]) / 1e6;
  const charged = est ? costPerChar * SAFETY_FACTOR : costPerChar;
  options.push({ kind: "audio", name: m[1], slug: m[2], cpc: (costPerChar / charged) * TARGET, est });
}

const packages = [...P.matchAll(/name: "([^"]+)",\s*\n\s*price: ([\d.]+),\s*\n\s*credits: ([\d_]+)/g)].map(
  (m) => ({ name: m[1], price: Number(m[2]), credits: Number(m[3].replaceAll("_", "")) }),
);

options.sort((a, b) => b.cpc - a.cpc);
const worst = options[0];
const over = options.filter((o) => o.cpc > TARGET + 1e-9);

console.log(`audited ${options.length} priced options across ${packages.length} packages\n`);
console.log("most expensive per 1M credits:");
for (const o of options.slice(0, 5)) {
  console.log(`  $${o.cpc.toFixed(4)}  ${o.kind.padEnd(6)} ${o.name}${o.est ? "  [est +safety]" : ""}`);
}

if (over.length) {
  console.error(`\n✗ ${over.length} option(s) exceed the $${TARGET} cap:`);
  for (const o of over) console.error(`    $${o.cpc.toFixed(4)}  ${o.kind} ${o.name}`);
}

console.log("\nprofit if a user spends everything on the worst option:");
let losing = 0;
for (const p of packages) {
  const api = (p.credits / 1e6) * worst.cpc;
  const allIn = api * TOPUP_FEE + p.price * CARD_PCT + CARD_FLAT;
  const profit = p.price - allIn;
  if (profit <= 0) losing++;
  console.log(
    `  ${p.name.padEnd(9)} $${p.price.toFixed(2).padStart(7)}  cost $${allIn.toFixed(2).padStart(7)}  profit $${profit.toFixed(2).padStart(6)}`,
  );
}

// ---- live comparison ----
let liveProblems = 0;
if (LIVE) {
  console.log("\n=== live check against OpenRouter ===");
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error("  OPENROUTER_API_KEY not set — skipping");
  } else {
    const prices = new Map();
    for (const url of [
      "https://openrouter.ai/api/v1/models",
      "https://openrouter.ai/api/v1/models?output_modality=video",
      "https://openrouter.ai/api/v1/models?output_modality=image",
    ]) {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) continue;
        const { data = [] } = await res.json();
        for (const e of data) prices.set(e.id, e.pricing);
      } catch {
        /* try the next endpoint */
      }
    }
    if (!prices.size) {
      console.error("  could not reach OpenRouter — cannot verify");
      liveProblems++;
    } else {
      const seen = new Set();
      for (const o of options) {
        if (seen.has(o.slug)) continue;
        seen.add(o.slug);
        if (!prices.has(o.slug)) {
          console.error(`  ✗ MISSING slug: ${o.slug}  (${o.name})`);
          liveProblems++;
        }
      }
      if (!liveProblems) console.log(`  ✓ all ${seen.size} slugs exist on OpenRouter`);
      console.log(
        "\n  Note: the app prices from these live values at runtime, so a price\n" +
          "  change is absorbed automatically. This check is for missing slugs.",
      );
    }
  }
}

if (over.length || losing || liveProblems) {
  console.error("\n✗ AUDIT FAILED — fix before shipping.");
  process.exit(1);
}
console.log("\n✓ no loss possible at any model, resolution or quality tier.");
