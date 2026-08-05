import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — Chat Free AI" };

export default function PrivacyPage() {
  return (
    <section className="px-6 py-14">
      <article className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink-faint">Last updated: July 2026</p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-mute">
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">What we collect</h2>
            <p className="mt-2">
              <span className="font-semibold text-ink">Account data:</span> your email address and
              sign-in method (Google or email). We never see or store your Google password; if you
              choose a password with us it is stored only as a bcrypt hash.
            </p>
            <p className="mt-2">
              <span className="font-semibold text-ink">Usage data:</span> credit usage counters and
              anonymised, hashed identifiers (IP + device hash) used to enforce free-tier limits.
            </p>
            <p className="mt-2">
              <span className="font-semibold text-ink">Payment data:</span> handled entirely by
              PayPal. Card numbers never reach our servers. We store only your subscription id and
              status.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">Your prompts</h2>
            <p className="mt-2">
              Prompts and generated content are sent to the AI model provider (via OpenRouter) to
              produce your result. Chat history is stored in your own browser (localStorage), not on
              our servers. We don&apos;t sell your data or use your prompts for advertising.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">Third parties</h2>
            <p className="mt-2">
              Supabase (authentication and database), PayPal (payments), OpenRouter and its
              upstream model providers (AI processing), Vercel (hosting), Upstash (rate limiting).
              Each processes only what is needed for its function.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">Your rights</h2>
            <p className="mt-2">
              You can request a copy or deletion of your account data at any time via the contact
              page. Deleting your account removes your profile and subscription records.
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
