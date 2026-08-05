/**
 * Resume Pass — a standalone 5-day product, separate from the credit packages.
 *
 * WHY IT'S SEPARATE: the monthly packages sell AI credits, metered by tokens.
 * The resume pass sells unlimited use of a self-contained tool for a short
 * window. Mixing them would either overcharge resume users (who don't need
 * 65M credits) or let a $3 pass drain an expensive model pool.
 *
 * COST CONTROL: "unlimited" here means unlimited resume building, editing,
 * template switching and PDF export — those cost us nothing per use. The AI
 * assist calls DO cost money, so they carry a generous but real daily cap
 * (see AI_ASSIST_DAILY). A normal user writing one resume uses 10-30 assists
 * in total; the cap only stops scripted abuse.
 *
 *   assist call ≈ 160 tokens ≈ 320 credits ≈ $0.00004
 *   400/day × 5 days = 2,000 calls ≈ $0.08 worst case
 *   PayPal fee on $2.99 ≈ $0.39  →  ~$2.5 net per pass
 */

export interface ResumePass {
  id: "resume5";
  name: string;
  price: number;
  days: number;
  aiAssistDaily: number;
  features: string[];
}

export const RESUME_PASS: ResumePass = {
  id: "resume5",
  name: "Resume Pass",
  price: 2.99,
  days: 5,
  aiAssistDaily: 300,
  // "N AI suggestions a day" is deliberately NOT a static line here — the N
  // is admin-adjustable (see /admin/limits), so any page rendering these
  // features generates that one line from the live effective value instead
  // (see app/pricing/page.tsx) rather than repeating a number that could
  // drift from what's actually enforced.
  features: [
    "All 40 templates, switch any time",
    "Unlimited resumes and edits",
    "Unlimited PDF downloads, no watermark",
    "ATS readiness score with specific fixes",
    "Photo templates and colour control",
  ],
};

/** Paid monthly packages include the resume builder at no extra cost. */
export const passIncludedInPackages = true;

export function passActive(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now();
}

export function passDaysLeft(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
