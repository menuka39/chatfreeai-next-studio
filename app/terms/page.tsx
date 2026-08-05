import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — Chat Free AI" };

export default function TermsPage() {
  return (
    <section className="px-6 py-14">
      <article className="prose-invert mx-auto max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-ink-faint">Last updated: July 2026</p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-mute">
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">1. The service</h2>
            <p className="mt-2">
              Chat Free AI provides access to third-party AI models for chat, image, video and voice
              generation, plus AI-powered tools. Free usage is subject to daily limits; paid packages
              provide a monthly credit allowance. We route requests to model providers (via
              OpenRouter) and do not train models ourselves.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">2. Accounts</h2>
            <p className="mt-2">
              You are responsible for activity on your account. Keep your sign-in method secure. You
              must be at least 13 years old (or the minimum age in your country) to use the service.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">3. Subscriptions and billing</h2>
            <p className="mt-2">
              Paid packages renew monthly through PayPal until cancelled. You can cancel any time
              from your account page; access continues until the end of the paid period. Credits
              reset monthly and unused credits do not roll over. Prices may change with notice
              before your next renewal.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">4. Acceptable use</h2>
            <p className="mt-2">
              Don&apos;t use the service to break the law, infringe others&apos; rights, generate
              malware, harass people, or attempt to bypass usage limits or security measures.
              Automated abuse of the free tier is prohibited. We may suspend accounts that violate
              these rules.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">5. AI output</h2>
            <p className="mt-2">
              AI-generated content can be wrong, biased or unsuitable. You are responsible for
              reviewing output before relying on it or publishing it. Subject to the model
              providers&apos; terms, you may use content you generate for personal or commercial
              purposes.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">6. Liability</h2>
            <p className="mt-2">
              The service is provided &quot;as is&quot;. To the maximum extent permitted by law, our
              total liability for any claim is limited to the amount you paid us in the three months
              before the claim arose.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">7. Contact</h2>
            <p className="mt-2">Questions about these terms: see the contact page.</p>
          </section>
        </div>
      </article>
    </section>
  );
}
