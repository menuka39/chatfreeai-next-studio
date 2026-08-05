import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Refund Policy — Chat Free AI" };

export default function RefundPage() {
  return (
    <section className="px-6 py-14">
      <article className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Refund Policy</h1>
        <p className="mt-2 text-sm text-ink-faint">Last updated: July 2026</p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-mute">
          <p>
            <span className="font-semibold text-ink">Failed generations are always refunded in
            credits, automatically.</span> If an image, video or voice generation fails, the credits
            return to your balance immediately — you never pay for output you didn&apos;t receive.
          </p>
          <p>
            <span className="font-semibold text-ink">Monthly subscriptions:</span> you can cancel
            any time from your <Link href="/account" className="underline">account page</Link> and
            keep full access until the end of the period you&apos;ve paid for. Because credits are
            usable immediately, we don&apos;t offer pro-rata refunds for partially used months.
          </p>
          <p>
            <span className="font-semibold text-ink">Billed by mistake?</span> If you were charged
            in error (for example, after cancelling), contact us within 14 days with your PayPal
            transaction id and we&apos;ll put it right.
          </p>
          <p>
            <span className="font-semibold text-ink">Service failures:</span> if a prolonged outage
            on our side prevents you using a substantial part of a month you paid for, contact us —
            we&apos;ll credit or refund fairly.
          </p>
        </div>
      </article>
    </section>
  );
}
