import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <section className="px-6 py-14">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Contact</h1>
        <p className="mt-3 text-ink-mute">
          Questions, billing issues, data requests or feedback — email us and we&apos;ll get back to
          you, usually within 24 hours (Pro Max subscribers are prioritised).
        </p>

        <div className="card-shadow mt-8 rounded-2xl border border-line bg-surface p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Email</p>
          <a href="mailto:support@chatfreeai.com" className="mt-1 block text-lg font-semibold text-brand hover:text-brand-deep">
            support@chatfreeai.com
          </a>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-mute">
            For billing questions, include your account email and (if relevant) the PayPal
            transaction id — it makes things much faster. For data deletion requests, email from the
            address on the account.
          </p>
        </div>
      </div>
    </section>
  );
}
